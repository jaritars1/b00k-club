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
  rowNumber: number;
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

// Reads a single row by its known sheet row number instead of the whole
// sheet. This is the fast path used when the client already knows which
// row a book lives on (it does, since listBooks() returns rowNumber).
async function readRow(rowNumber: number): Promise<SheetRow | null> {
  const range = `Sheet1!A${rowNumber}:H${rowNumber}`;
  const res = await sheetFetch(
    `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${range}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Failed to read row: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const r = data.values?.[0];
  if (!r) return null;
  return {
    rowNumber,
    id: r[0] ?? "",
    title: r[1] ?? "",
    author: r[2] ?? "",
    genre: r[3] ?? "Other",
    createdAt: Number(r[4]) || 0,
    status: normalizeStatus(r[5] ?? ""),
    votes: Number(r[6]) || 0,
    deletedAt: r[7] ?? "",
  };
}

// `rowNumber` is an optional hint from the client (echoed back from a prior
// listBooks() call). When it's present and still points at the right book,
// this does one single-row read instead of reading every row in the sheet.
// Falls back to a full scan if the hint is missing or stale (e.g. someone
// edited the sheet by hand), so correctness never depends on the client.
async function findRow(id: string, rowNumber?: number): Promise<SheetRow> {
  if (rowNumber && rowNumber > 1) {
    const row = await readRow(rowNumber);
    if (row && row.id === id) return row;
  }
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
    rowNumber: row.rowNumber,
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
    const draft = {
      id: crypto.randomUUID(),
      title: data.title,
      author: data.author,
      genre: data.genre,
      createdAt: Date.now(),
      status: "recommended" as const,
      votes: 0,
    };
    const res = await sheetFetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [
            toRowValues({ ...draft, rowNumber: 0, deletedAt: "" }),
          ],
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to add book: ${res.status} ${await res.text()}`);
    }
    // Pull the actual row number out of the append response (e.g.
    // "Sheet1!A6:H6") so the client can target this row directly on its
    // very next action, instead of falling back to a full sheet scan.
    const body = (await res.json()) as { updates?: { updatedRange?: string } };
    const match = body.updates?.updatedRange?.match(/![A-Z]+(\d+):/);
    const rowNumber = match ? Number(match[1]) : 0;
    return { ...draft, rowNumber };
  });

export const updateBook = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: string;
      title: string;
      author: string;
      genre: string;
      rowNumber?: number;
    }) => {
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
      return { id, title, author, genre, rowNumber: data.rowNumber };
    },
  )
  .handler(async ({ data }): Promise<BookRec> => {
    const row = await findRow(data.id, data.rowNumber);
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
  .inputValidator((data: { id: string; rowNumber?: number }) => {
    const id = String(data.id ?? "").trim();
    if (!id) throw new Error("Missing book id");
    return { id, rowNumber: data.rowNumber };
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const row = await findRow(data.id, data.rowNumber);
    // Soft delete: the row is preserved in the sheet so an admin can restore it.
    await writeRow({
      ...row,
      status: "deleted",
      deletedAt: new Date().toISOString(),
    });
    return { id: data.id };
  });

export const setBookStatus = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; status: BookStatus; rowNumber?: number }) => {
      const id = String(data.id ?? "").trim();
      const status = String(data.status ?? "") as BookStatus;
      if (!id) throw new Error("Missing book id");
      if (!["recommended", "nominated", "read"].includes(status)) {
        throw new Error("Invalid status");
      }
      return { id, status, rowNumber: data.rowNumber };
    },
  )
  .handler(async ({ data }): Promise<BookRec> => {
    const row = await findRow(data.id, data.rowNumber);
    const updated: SheetRow = { ...row, status: data.status };
    await writeRow(updated);
    return publicBook(updated);
  });

export const voteBook = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; delta: number; rowNumber?: number }) => {
    const id = String(data.id ?? "").trim();
    const delta = Number(data.delta);
    if (!id) throw new Error("Missing book id");
    if (delta !== 1 && delta !== -1) throw new Error("Invalid vote");
    return { id, delta, rowNumber: data.rowNumber };
  })
  .handler(async ({ data }): Promise<BookRec> => {
    const row = await findRow(data.id, data.rowNumber);
    const updated: SheetRow = {
      ...row,
      votes: Math.max(0, row.votes + data.delta),
    };
    await writeRow(updated);
    return publicBook(updated);
  });
