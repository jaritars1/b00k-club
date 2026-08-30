# Book club: tabs, nominations, voting, and read history

## What you get

Under "Add a Recommendation", the books section becomes three tabs:

1. **Recommended Books** — every suggestion. Each row gets **Edit**, **Delete**, and **Nominate** (moves it to the voting tab).
2. **Voted on for next read** — only nominated books, sorted by vote count. Each row has an upvote button (one vote per book per browser, click again to remove it) and a **Mark as read** button.
3. **Already read** — books marked as read, with a button to send one back to Recommended if it was a mistake.

Vote totals live in the shared sheet so everyone sees the same numbers; your own browser remembers which books *you* voted for so you can't double-vote and can un-vote.

Deleting is a soft delete: the book disappears from every tab, but its row stays in the sheet with the status changed to `deleted` (plus a `deletedAt` timestamp). Nothing is ever removed from the spreadsheet, so you can restore an accidental delete by changing that cell back to `recommended`.

## Sheet changes

New columns are appended to the existing sheet (existing rows keep working, treated as status `recommended` with 0 votes):

```text
A: id | B: title | C: author | D: genre | E: createdAt | F: status | G: votes | H: deletedAt
```

`status` is one of `recommended`, `nominated`, `read`, `deleted`.

## Technical notes

- `src/lib/books.functions.ts` gains server functions: `updateBook` (title/author/genre), `deleteBook` (soft delete), `setBookStatus`, and `voteBook` (delta +1/-1).
  - Reads pull `Sheet1!A2:H` and filter out `status === "deleted"` before returning to the page.
  - Row index is resolved by matching `id`, then written with a targeted `values/Sheet1!A{n}:H{n}?valueInputOption=RAW` update. No row is ever removed from the sheet.
  - Vote writes are read-modify-write on the single row; last write wins, which is fine at book-club scale.

- `src/routes/index.tsx` uses shadcn `Tabs` for the three sections, a `Dialog` for editing, and `AlertDialog` to confirm deletes. Search + genre filter stay and apply within the active tab.
- Local votes stored in `localStorage` under `alw-bookclub-votes` (array of book ids), read in `useEffect` to avoid hydration mismatch.
- All mutations go through `useMutation` + `useServerFn` and invalidate the `["books"]` query.
- Also adding a short retry/backoff on sheet reads: the preview hit a Google Sheets per-minute rate limit and returned a 500 instead of degrading gracefully.
