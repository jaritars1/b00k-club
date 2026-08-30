import { createServerFn } from "@tanstack/react-start";

const SPREADSHEET_ID = "17ucbZWatLBWuMoTz4ZE04BuztgEtihJ1sIyPOKgQwuk";
const RANGE = "Sheet1!A2:H";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

export type BookStatus = "recommended" | "nominated" | "read" | "deleted";

export interface BookRec {
  id: string;
  title: string;
  author: string;
  genre: string;
  createdAt: number;
  status: BookStatus;
  votes: number;
}

interface SheetRow extends BookRec {
  rowNumber: number;
  deletedAt: string;
}

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !sheetsKey) {
    throw new Error("Missing Google Sheets gateway credentials");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": sheetsKey,
  };
}

function normalizeStatus(value: string): BookStatus {
  switch (value) {
    case "nominated":
    case "read":
    case "deleted":
      return value;
    default:
      return "recommended";
  }
}

async function sheetFetch(
  url: string,
  init?: RequestInit,
  retries = 2,
): Promise<Response> {
  let attempt = 0;
  // Sheets enforces a per-minute quota; back off on 429/5xx instead of failing hard.
  for (;;) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) return res;
    const retryAfter = Number(res.headers.get("Retry-After"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 4000)
      : 400 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt += 1;
  }
}

async function readRows(): Promise<SheetRow[]> {
  const res = await sheetFetch(
    `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Failed to read sheet: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values ?? [];
  return rows
    .map((r, i) => ({
      rowNumber: i + 2,
      id: r[0] ?? "",
      title: r[1] ?? "",
      author: r[2] ?? "",
      genre: r[3] ?? "Other",
      createdAt: Number(r[4]) || 0,
      status: normalizeStatus(r[5] ?? ""),
      votes: Number(r[6]) || 0,
      deletedAt: r[7] ?? "",
    }))
    .filter((r) => r.id);
}

function toRowValues(row: SheetRow): string[] {
  return [
    row.id,
    row.title,
    row.author,
    row.genre,
    String(row.createdAt),
    row.status,
    String(row.votes),
    row.deletedAt,
  ];
}

async function writeRow(row: SheetRow): Promise<void> {
  const range = `Sheet1!A${row.rowNumber}:H${row.rowNumber}`;
  const res = await sheetFetch(
    `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ values: [toRowValues(row)] }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to update sheet: ${res.status} ${await res.text()}`);
  }
}

async function findRow(id: string): Promise<SheetRow> {
  const rows = await readRows();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Book not found");
  return row;
}

function publicBook(row: SheetRow): BookRec {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genre: row.genre,
    createdAt: row.createdAt,
    status: row.status,
    votes: row.votes,
  };
}

export const listBooks = createServerFn({ method: "GET" }).handler(
  async (): Promise<BookRec[]> => {
    const rows = await readRows();
    return rows
      .filter((r) => r.status !== "deleted")
      .map(publicBook)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
);

export const addBook = createServerFn({ method: "POST" })
  .inputValidator((data: { title: string; author: string; genre: string }) => {
    const title = String(data.title ?? "").trim();
    const author = String(data.author ?? "").trim();
    const genre = String(data.genre ?? "").trim();
    if (!title || !author || !genre) {
      throw new Error("Title, author, and genre are required");
    }
    if (title.length > 200 || author.length > 200 || genre.length > 50) {
      throw new Error("Input too long");
    }
    return { title, author, genre };
  })
  .handler(async ({ data }): Promise<BookRec> => {
    const book: BookRec = {
      id: crypto.randomUUID(),
      title: data.title,
      author: data.author,
      genre: data.genre,
      createdAt: Date.now(),
      status: "recommended",
      votes: 0,
    };
    const res = await sheetFetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [
            toRowValues({ ...book, rowNumber: 0, deletedAt: "" }),
          ],
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to add book: ${res.status} ${await res.text()}`);
    }
    return book;
  });

export const updateBook = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; title: string; author: string; genre: string }) => {
      const id = String(data.id ?? "").trim();
      const title = String(data.title ?? "").trim();
      const author = String(data.author ?? "").trim();
      const genre = String(data.genre ?? "").trim();
      if (!id) throw new Error("Missing book id");
      if (!title || !author || !genre) {
        throw new Error("Title, author, and genre are required");
      }
      if (title.length > 200 || author.length > 200 || genre.length > 50) {
        throw new Error("Input too long");
      }
      return { id, title, author, genre };
    },
  )
  .handler(async ({ data }): Promise<BookRec> => {
    const row = await findRow(data.id);
    const updated: SheetRow = {
      ...row,
      title: data.title,
      author: data.author,
      genre: data.genre,
    };
    await writeRow(updated);
    return publicBook(updated);
  });

export const deleteBook = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    const id = String(data.id ?? "").trim();
    if (!id) throw new Error("Missing book id");
    return { id };
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const row = await findRow(data.id);
    // Soft delete: the row is preserved in the sheet so an admin can restore it.
    await writeRow({
      ...row,
      status: "deleted",
      deletedAt: new Date().toISOString(),
    });
    return { id: data.id };
  });

export const setBookStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: BookStatus }) => {
    const id = String(data.id ?? "").trim();
    const status = String(data.status ?? "") as BookStatus;
    if (!id) throw new Error("Missing book id");
    if (!["recommended", "nominated", "read"].includes(status)) {
      throw new Error("Invalid status");
    }
    return { id, status };
  })
  .handler(async ({ data }): Promise<BookRec> => {
    const row = await findRow(data.id);
    const updated: SheetRow = { ...row, status: data.status };
    await writeRow(updated);
    return publicBook(updated);
  });

export const voteBook = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; delta: number }) => {
    const id = String(data.id ?? "").trim();
    const delta = Number(data.delta);
    if (!id) throw new Error("Missing book id");
    if (delta !== 1 && delta !== -1) throw new Error("Invalid vote");
    return { id, delta };
  })
  .handler(async ({ data }): Promise<BookRec> => {
    const row = await findRow(data.id);
    const updated: SheetRow = {
      ...row,
      votes: Math.max(0, row.votes + data.delta),
    };
    await writeRow(updated);
    return publicBook(updated);
  });
