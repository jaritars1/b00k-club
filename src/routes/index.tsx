import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Plus, Search, Loader2 } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { addBook, listBooks } from "@/lib/books.functions";

const GENRES = [
  "Fiction",
  "Non-Fiction",
  "Mystery/Thriller",
  "Sci-Fi/Fantasy",
  "Romance",
  "Biography/History",
  "Other",
] as const;

type Genre = (typeof GENRES)[number];

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
  const router = useRouter();
  const addBookFn = useServerFn(addBook);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState<Genre | "">("");
  const [filterGenre, setFilterGenre] = useState<Genre | "all">("all");
  const [search, setSearch] = useState("");

  const mutation = useMutation({
    mutationFn: (vars: { title: string; author: string; genre: Genre }) =>
      addBookFn({ data: vars }),
    onSuccess: async () => {
      setTitle("");
      setAuthor("");
      setGenre("");
      toast.success("Recommendation added!");
      await router.invalidate();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add book");
    },
  });

  const canSubmit =
    title.trim() && author.trim() && genre && !mutation.isPending;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({
      title: title.trim(),
      author: author.trim(),
      genre: genre as Genre,
    });
  };

  const filteredBooks = books.filter((book) => {
    const matchesGenre = filterGenre === "all" || book.genre === filterGenre;
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query);
    return matchesGenre && matchesSearch;
  });

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
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="author">Author</Label>
                  <Input
                    id="author"
                    placeholder="e.g. Erin Morgenstern"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre">Genre</Label>
                  <Select
                    value={genre}
                    onValueChange={(value) => setGenre(value as Genre)}
                    disabled={mutation.isPending}
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
                    {mutation.isPending ? (
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

        <section aria-labelledby="recommendations-heading" className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2
              id="recommendations-heading"
              className="font-serif text-2xl font-semibold tracking-tight text-foreground"
            >
              Recommended Books
              <span className="ml-2 text-base font-sans font-normal text-muted-foreground">
                ({filteredBooks.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:min-w-[24rem]">
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
                onValueChange={(value) =>
                  setFilterGenre(value as Genre | "all")
                }
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
          </div>

          {filteredBooks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                {books.length === 0
                  ? "No recommendations yet. Add the first book above!"
                  : "No books match your search or filter."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredBooks.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-base font-semibold text-foreground">
                      {book.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      by {book.author}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      genreClass(book.genre),
                      "border-transparent font-sans shrink-0",
                    )}
                  >
                    {book.genre}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
