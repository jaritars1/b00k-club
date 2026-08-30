import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  queryOptions,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Plus,
  Search,
  Loader2,
  Pencil,
  Trash2,
  ThumbsUp,
  Vote,
  CheckCheck,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  addBook,
  deleteBook,
  listBooks,
  setBookStatus,
  updateBook,
  voteBook,
  type BookRec,
} from "@/lib/books.functions";

const GENRES = [
  "Fiction",
  "Non-Fiction",
  "Mystery/Thriller",
  "Sci-Fi/Fantasy",
  "Romance",
  "Biography/History",
  "Historical Fiction",
  "Other",
] as const;

type Genre = (typeof GENRES)[number];

const VOTES_KEY = "alw-bookclub-votes";

function genreClass(genre: string): string {
  switch (genre) {
    case "Fiction":
      return "genre-fiction";
    case "Non-Fiction":
      return "genre-nonfiction";
    case "Mystery/Thriller":
      return "genre-mystery";
    case "Sci-Fi/Fantasy":
      return "genre-scifi";
    case "Romance":
      return "genre-romance";
    case "Biography/History":
      return "genre-bio";
    case "Historical Fiction":
      return "genre-historical";
    default:
      return "genre-other";
  }
}

const booksQueryOptions = queryOptions({
  queryKey: ["books"],
  queryFn: () => listBooks(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ALW Bookclub\u00a0" },
      {
        name: "description",
        content: "Share your book suggestions for our next read!",
      },
      { property: "og:title", content: "ALW Bookclub\u00a0" },
      {
        property: "og:description",
        content: "Share your book suggestions for our next read!",
      },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(booksQueryOptions),
  component: BookClubHub,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-destructive">
      Failed to load books: {error.message}
    </div>
  ),
  notFoundComponent: () => <div>Not found.</div>,
});

function BookClubHub() {
  const { data: books } = useSuspenseQuery(booksQueryOptions);
  const addBookFn = useServerFn(addBook);
  const updateBookFn = useServerFn(updateBook);
  const deleteBookFn = useServerFn(deleteBook);
  const setStatusFn = useServerFn(setBookStatus);
  const voteBookFn = useServerFn(voteBook);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState<Genre | "">("");
  const [filterGenre, setFilterGenre] = useState<Genre | "all">("all");
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<BookRec | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editGenre, setEditGenre] = useState<Genre | "">("");
  const [deleting, setDeleting] = useState<BookRec | null>(null);

  const [myVotes, setMyVotes] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOTES_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMyVotes(parsed.filter((v): v is string => typeof v === "string"));
        }
      }
    } catch {
      /* ignore malformed cache */
    }
  }, []);

  const persistVotes = (next: string[]) => {
    setMyVotes(next);
    try {
      localStorage.setItem(VOTES_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const queryClient = useQueryClient();

  // Reconciles with the server in the background without blocking the UI —
  // used after a mutation settles so a stray edit from someone else in the
  // shared sheet eventually shows up, but the button click itself never
  // has to wait on this.
  const syncInBackground = () => {
    queryClient.invalidateQueries({ queryKey: booksQueryOptions.queryKey });
  };

  // Every button (nominate, vote, mark read, move back, etc.) patches the
  // cached book list immediately so the relevant tab/section re-renders on
  // click, instead of waiting for the sheet round-trip to finish.
  const patchBook = (id: string, patch: Partial<BookRec>) => {
    queryClient.setQueryData<BookRec[]>(booksQueryOptions.queryKey, (old) =>
      old?.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  };

  const removeBookFromCache = (id: string) => {
    queryClient.setQueryData<BookRec[]>(booksQueryOptions.queryKey, (old) =>
      old?.filter((b) => b.id !== id),
    );
  };

  const snapshotBooks = () =>
    queryClient.getQueryData<BookRec[]>(booksQueryOptions.queryKey);

  const restoreBooks = (snapshot: BookRec[] | undefined) => {
    if (snapshot) {
      queryClient.setQueryData(booksQueryOptions.queryKey, snapshot);
    }
  };

  const addMutation = useMutation({
    mutationFn: (vars: { title: string; author: string; genre: Genre }) =>
      addBookFn({ data: vars }),
    onSuccess: async (newBook) => {
      queryClient.setQueryData<BookRec[]>(booksQueryOptions.queryKey, (old) =>
        old ? [newBook, ...old] : [newBook],
      );
      setTitle("");
      setAuthor("");
      setGenre("");
      toast.success("Recommendation added!");
      syncInBackground();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to add book"),
  });

  const editMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      title: string;
      author: string;
      genre: Genre;
      rowNumber: number;
    }) => updateBookFn({ data: vars }),
    onMutate: (vars) => {
      const previous = snapshotBooks();
      patchBook(vars.id, {
        title: vars.title,
        author: vars.author,
        genre: vars.genre,
      });
      return { previous };
    },
    onSuccess: () => {
      setEditing(null);
      toast.success("Book updated");
      syncInBackground();
    },
    onError: (err: Error, _vars, context) => {
      restoreBooks(context?.previous);
      toast.error(err.message || "Failed to update book");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (vars: { id: string; rowNumber: number }) =>
      deleteBookFn({ data: vars }),
    onMutate: (vars) => {
      const previous = snapshotBooks();
      removeBookFromCache(vars.id);
      return { previous };
    },
    onSuccess: () => {
      setDeleting(null);
      toast.success("Book removed");
      syncInBackground();
    },
    onError: (err: Error, _vars, context) => {
      restoreBooks(context?.previous);
      toast.error(err.message || "Failed to delete book");
    },
  });

  const statusMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      status: "recommended" | "nominated" | "read";
      rowNumber: number;
    }) => setStatusFn({ data: vars }),
    onMutate: (vars) => {
      const previous = snapshotBooks();
      patchBook(vars.id, { status: vars.status });
      return { previous };
    },
    onSuccess: () => {
      syncInBackground();
    },
    onError: (err: Error, _vars, context) => {
      restoreBooks(context?.previous);
      toast.error(err.message || "Failed to move book");
    },
  });

  const voteMutation = useMutation({
    mutationFn: (vars: { id: string; delta: 1 | -1; rowNumber: number }) =>
      voteBookFn({ data: vars }),
    onMutate: (vars) => {
      const previous = snapshotBooks();
      const current = previous?.find((b) => b.id === vars.id);
      if (current) {
        patchBook(vars.id, { votes: Math.max(0, current.votes + vars.delta) });
      }
      return { previous };
    },
    onSuccess: () => {
      syncInBackground();
    },
    onError: (err: Error, _vars, context) => {
      restoreBooks(context?.previous);
      toast.error(err.message || "Failed to save vote");
    },
  });

  const canSubmit =
    title.trim() && author.trim() && genre && !addMutation.isPending;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    addMutation.mutate({
      title: title.trim(),
      author: author.trim(),
      genre: genre as Genre,
    });
  };

  const openEdit = (book: BookRec) => {
    setEditing(book);
    setEditTitle(book.title);
    setEditAuthor(book.author);
    setEditGenre(book.genre as Genre);
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editTitle.trim() || !editAuthor.trim() || !editGenre) return;
    editMutation.mutate({
      id: editing.id,
      title: editTitle.trim(),
      author: editAuthor.trim(),
      genre: editGenre,
      rowNumber: editing.rowNumber,
    });
  };

  const handleVote = (book: BookRec) => {
    const hasVoted = myVotes.includes(book.id);
    const delta: 1 | -1 = hasVoted ? -1 : 1;
    persistVotes(
      hasVoted ? myVotes.filter((id) => id !== book.id) : [...myVotes, book.id],
    );
    voteMutation.mutate({ id: book.id, delta, rowNumber: book.rowNumber });
  };

  const matchesFilters = (book: BookRec) => {
    const matchesGenre = filterGenre === "all" || book.genre === filterGenre;
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query);
    return matchesGenre && matchesSearch;
  };

  const recommended = books
    .filter((b) => b.status === "recommended")
    .filter(matchesFilters);
  const nominated = books
    .filter((b) => b.status === "nominated")
    .filter(matchesFilters)
    .sort((a, b) => b.votes - a.votes || b.createdAt - a.createdAt);
  const alreadyRead = books
    .filter((b) => b.status === "read")
    .filter(matchesFilters);

  const busy =
    statusMutation.isPending || voteMutation.isPending || deleteMutation.isPending;

  const bookRow = (book: BookRec, actions: React.ReactNode) => (
    <div
      key={book.id}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-1">
        <p className="truncate text-base font-semibold text-foreground">
          {book.title}
        </p>
        <p className="text-sm text-muted-foreground">by {book.author}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={cn(
            genreClass(book.genre),
            "border-transparent font-sans shrink-0",
          )}
        >
          {book.genre}
        </Badge>
        {actions}
      </div>
    </div>
  );

  const emptyState = (message: string) => (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
      <p className="mt-4 text-muted-foreground">{message}</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="text-center space-y-3">
          <div className="inline-flex items-center justify-center rounded-full bg-secondary p-3">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            ALW Bookclub&nbsp;
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Share your book suggestions for our next read!
          </p>
        </header>

        <section aria-labelledby="add-heading">
          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle id="add-heading" className="font-serif text-2xl">
                Add a Recommendation
              </CardTitle>
              <CardDescription>What should we read next?</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleAdd}
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="title">Book Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g. The Night Circus"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={addMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="author">Author</Label>
                  <Input
                    id="author"
                    placeholder="e.g. Erin Morgenstern"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    disabled={addMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre">Genre</Label>
                  <Select
                    value={genre}
                    onValueChange={(value) => setGenre(value as Genre)}
                    disabled={addMutation.isPending}
                  >
                    <SelectTrigger id="genre" className="w-full">
                      <SelectValue placeholder="Select genre" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENRES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={!canSubmit} className="w-full">
                    {addMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add Book
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="library-heading" className="space-y-5">
          <h2 id="library-heading" className="sr-only">
            Book club library
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by title or author"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={filterGenre}
              onValueChange={(value) => setFilterGenre(value as Genre | "all")}
            >
              <SelectTrigger id="filter-genre" className="w-full">
                <SelectValue placeholder="Filter by genre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genres</SelectItem>
                {GENRES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="recommended" className="space-y-5">
            <TabsList className="grid w-full grid-cols-1 gap-1 h-auto sm:grid-cols-3">
              <TabsTrigger value="recommended">
                Recommended Books ({recommended.length})
              </TabsTrigger>
              <TabsTrigger value="nominated">
                Voted on for next read ({nominated.length})
              </TabsTrigger>
              <TabsTrigger value="read">
                Already read ({alreadyRead.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recommended" className="space-y-3">
              {recommended.length === 0
                ? emptyState(
                    "No recommendations here yet. Add the first book above!",
                  )
                : recommended.map((book) =>
                    bookRow(
                      book,
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            statusMutation.mutate({
                              id: book.id,
                              status: "nominated",
                              rowNumber: book.rowNumber,
                            })
                          }
                        >
                          <Vote className="h-4 w-4" />
                          Nominate
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${book.title}`}
                          onClick={() => openEdit(book)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${book.title}`}
                          onClick={() => setDeleting(book)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>,
                    ),
                  )}
            </TabsContent>

            <TabsContent value="nominated" className="space-y-3">
              {nominated.length === 0
                ? emptyState(
                    "No books nominated yet. Nominate one from the Recommended tab.",
                  )
                : nominated.map((book) =>
                    bookRow(
                      book,
                      <>
                        <Button
                          variant={
                            myVotes.includes(book.id) ? "default" : "outline"
                          }
                          size="sm"
                          disabled={busy}
                          aria-pressed={myVotes.includes(book.id)}
                          onClick={() => handleVote(book)}
                        >
                          <ThumbsUp className="h-4 w-4" />
                          {book.votes}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            statusMutation.mutate({
                              id: book.id,
                              status: "read",
                              rowNumber: book.rowNumber,
                            })
                          }
                        >
                          <CheckCheck className="h-4 w-4" />
                          Mark as read
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            statusMutation.mutate({
                              id: book.id,
                              status: "recommended",
                              rowNumber: book.rowNumber,
                            })
                          }
                        >
                          <Undo2 className="h-4 w-4" />
                          Back to recommended
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${book.title}`}
                          onClick={() => openEdit(book)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${book.title}`}
                          onClick={() => setDeleting(book)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>,
                    ),
                  )}
            </TabsContent>

            <TabsContent value="read" className="space-y-3">
              {alreadyRead.length === 0
                ? emptyState("Nothing marked as read yet.")
                : alreadyRead.map((book) =>
                    bookRow(
                      book,
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          statusMutation.mutate({
                            id: book.id,
                            status: "recommended",
                            rowNumber: book.rowNumber,
                          })
                        }
                      >
                        <Undo2 className="h-4 w-4" />
                        Back to recommended
                      </Button>,
                    ),
                  )}
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Edit book</DialogTitle>
            <DialogDescription>
              Fix a typo or change the genre for this recommendation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Book Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-author">Author</Label>
              <Input
                id="edit-author"
                value={editAuthor}
                onChange={(e) => setEditAuthor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-genre">Genre</Label>
              <Select
                value={editGenre}
                onValueChange={(value) => setEditGenre(value as Genre)}
              >
                <SelectTrigger id="edit-genre" className="w-full">
                  <SelectValue placeholder="Select genre" />
                </SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              Remove “{deleting?.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It will disappear from the list, but the row is kept in the shared
              spreadsheet so an admin can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleting)
                  deleteMutation.mutate({
                    id: deleting.id,
                    rowNumber: deleting.rowNumber,
                  });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
