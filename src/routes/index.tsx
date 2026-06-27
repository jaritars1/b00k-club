import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Plus, Search, Trash2 } from "lucide-react";

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

interface BookRec {
  id: string;
  title: string;
  author: string;
  genre: Genre;
  createdAt: number;
}

const STORAGE_KEY = "book-club-recommendations";

function genreClass(genre: Genre): string {
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
    case "Other":
      return "genre-other";
  }
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ALW Bookclub\u00a0" },
      {
        name: "description",
        content:
          "Share your book suggestions for our next read!",
      },
      { property: "og:title", content: "ALW Bookclub\u00a0" },
      {
        property: "og:description",
        content:
          "Share your book suggestions for our next read!",
      },
    ],
  }),
  component: BookClubHub,
});

function BookClubHub() {
  const [books, setBooks] = useState<BookRec[]>([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState<Genre | "">("");
  const [filterGenre, setFilterGenre] = useState<Genre | "all">("all");
  const [search, setSearch] = useState("");

  // Load from localStorage on mount (client-side only).
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as BookRec[];
      if (Array.isArray(parsed)) {
        setBooks(parsed);
      }
    } catch {
      setBooks([]);
    }
  }, []);

  // Persist to localStorage whenever books change.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  }, [books]);

  const canSubmit = title.trim() && author.trim() && genre;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const newBook: BookRec = {
      id: crypto.randomUUID(),
      title: title.trim(),
      author: author.trim(),
      genre: genre as Genre,
      createdAt: Date.now(),
    };

    setBooks((prev) => [newBook, ...prev]);
    setTitle("");
    setAuthor("");
    setGenre("");
  };

  const handleDelete = (id: string) => {
    setBooks((prev) => prev.filter((book) => book.id !== id));
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
        {/* Header */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center justify-center rounded-full bg-secondary p-3">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Book Club Recommendation Hub
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Share your favorite reads and find the next book your club will love.
          </p>
        </header>

        {/* Add Recommendation Form */}
        <section aria-labelledby="add-heading">
          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle
                id="add-heading"
                className="font-serif text-2xl"
              >
                Add a Recommendation
              </CardTitle>
              <CardDescription>
                Tell us about a book the club should read next.
              </CardDescription>
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="author">Author</Label>
                  <Input
                    id="author"
                    placeholder="e.g. Erin Morgenstern"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre">Genre</Label>
                  <Select
                    value={genre}
                    onValueChange={(value) => setGenre(value as Genre)}
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
                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4" />
                    Add Book
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        {/* Recommended Books */}
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
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map((book) => (
                <Card
                  key={book.id}
                  className="flex flex-col justify-between border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="line-clamp-2 text-lg leading-snug">
                        {book.title}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(book.id)}
                        aria-label={`Delete ${book.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription className="text-sm">
                      by {book.author}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Badge
                      className={cn(
                        genreClass(book.genre),
                        "border-transparent font-sans",
                      )}
                    >
                      {book.genre}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
