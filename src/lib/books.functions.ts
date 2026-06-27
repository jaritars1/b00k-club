import { createServerFn } from "@tanstack/react-start";

const SPREADSHEET_ID = "17ucbZWatLBWuMoTz4ZE04BuztgEtihJ1sIyPOKgQwuk";
const RANGE = "Sheet1!A2:E";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

export interface BookRec {
  id: string;
  title: string;
  author: string;
  genre: string;
  createdAt: number;
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

export const listBooks = createServerFn({ method: "GET" }).handler(
  async (): Promise<BookRec[]> => {
    const res = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`,
      { headers: authHeaders() },
    );
    if (!res.ok) {
      throw new Error(`Failed to read sheet: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { values?: string[][] };
    const rows = data.values ?? [];
    return rows
      .filter((r) => r[0])
      .map((r) => ({
        id: r[0] ?? "",
        title: r[1] ?? "",
        author: r[2] ?? "",
        genre: r[3] ?? "Other",
        createdAt: Number(r[4]) || 0,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
);

export const addBook = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { title: string; author: string; genre: string }) => {
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
    },
  )
  .handler(async ({ data }): Promise<BookRec> => {
    const book: BookRec = {
      id: crypto.randomUUID(),
      title: data.title,
      author: data.author,
      genre: data.genre,
      createdAt: Date.now(),
    };
    const res = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [
            [book.id, book.title, book.author, book.genre, String(book.createdAt)],
          ],
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to add book: ${res.status} ${await res.text()}`);
    }
    return book;
  });
