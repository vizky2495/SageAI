import TopNav from "@/components/top-nav";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BookOpen,
  Clipboard,
  GitBranch,
  GitCommit,
  GitMerge,
  History,
  Loader2,
  Plus,
  Search,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PromptVersion, Collaborator } from "@shared/schema";

type DiffLine = { type: "add" | "del" | "ctx"; text: string };

function cnRisk(risk: string) {
  if (risk === "high") return "bg-destructive/12 text-destructive border-destructive/20";
  if (risk === "medium") return "bg-chart-4/10 text-chart-4 border-chart-4/20";
  return "bg-chart-1/10 text-chart-3 border-chart-1/20";
}

function formatStatus(s: string) {
  if (s === "latest") return "Latest";
  if (s === "draft") return "Draft";
  return "Released";
}

function statusTone(s: string) {
  if (s === "latest") return "bg-chart-1/12 text-chart-3 border-chart-1/20";
  if (s === "draft") return "bg-chart-4/10 text-chart-4 border-chart-4/20";
  return "bg-muted text-muted-foreground border-border";
}

function diffTone(t: DiffLine["type"]) {
  if (t === "add") return "bg-chart-1/10 border-chart-1/20 text-foreground";
  if (t === "del") return "bg-destructive/10 border-destructive/20 text-foreground";
  return "bg-card/40 border-border/70 text-muted-foreground";
}

function copyToClipboard(text: string) {
  return navigator.clipboard?.writeText(text);
}

function timeAgo(date: string | Date) {
  const d = new Date(date);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function PromptStudio() {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"versions" | "collab" | "diff">("versions");
  const [diffCompareId, setDiffCompareId] = useState<string | null>(null);

  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [nvTag, setNvTag] = useState("");
  const [nvAuthor, setNvAuthor] = useState("");
  const [nvSummary, setNvSummary] = useState("");

  const [newCollabOpen, setNewCollabOpen] = useState(false);
  const [ncName, setNcName] = useState("");
  const [ncInitials, setNcInitials] = useState("");
  const [ncFile, setNcFile] = useState("");
  const [ncFocus, setNcFocus] = useState("");
  const [ncLayer, setNcLayer] = useState("");

  const { data: versions = [], isLoading: versionsLoading } = useQuery<PromptVersion[]>({
    queryKey: ["/api/versions"],
  });

  const { data: collabs = [], isLoading: collabsLoading } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const selected = useMemo(() => {
    if (selectedId) return versions.find((v) => v.id === selectedId) || versions[0];
    return versions[0];
  }, [selectedId, versions]);

  const filteredVersions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return versions;
    return versions.filter(
      (v) =>
        v.tag.toLowerCase().includes(s) ||
        v.author.toLowerCase().includes(s) ||
        v.summary.toLowerCase().includes(s),
    );
  }, [q, versions]);

  const prevVersion = useMemo(() => {
    if (!selected || versions.length < 2) return null;
    const idx = versions.findIndex((v) => v.id === selected.id);
    return idx >= 0 && idx < versions.length - 1 ? versions[idx + 1] : null;
  }, [selected, versions]);

  const compareId = diffCompareId || prevVersion?.id;

  const { data: diffData, isLoading: diffLoading } = useQuery<{
    diff: DiffLine[];
    from: string;
    to: string;
  }>({
    queryKey: ["/api/diff", selected?.id, compareId],
    queryFn: async () => {
      const res = await fetch(`/api/diff/${selected!.id}/${compareId}`);
      if (!res.ok) throw new Error("Failed to load diff");
      return res.json();
    },
    enabled: !!selected && !!compareId,
  });

  const { data: compileData } = useQuery<{
    compiled: string;
    size: string;
    layerCount: number;
  }>({
    queryKey: ["/api/compile"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/compile");
      return res.json();
    },
  });

  const compiledPreview = useMemo(() => {
    if (compileData) return compileData.compiled;
    if (!selected) return "";
    return selected.compiledContent || "(no compiled content)";
  }, [compileData, selected]);

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/versions", {
        tag: nvTag,
        author: nvAuthor,
        summary: nvSummary,
        status: "draft",
        promptsCount: collabs.length + 1,
        compiledSize: compileData?.size || "0 KB",
        compiledContent: compileData?.compiled || "",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/versions"] });
      setNewVersionOpen(false);
      setNvTag("");
      setNvAuthor("");
      setNvSummary("");
    },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/versions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/versions"] });
      setSelectedId(null);
    },
  });

  const releaseVersionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/versions/${id}`, { status: "released" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/versions"] });
    },
  });

  const createCollabMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/collaborators", {
        name: ncName,
        initials: ncInitials,
        file: ncFile,
        focus: ncFocus,
        layerContent: ncLayer,
        risk: "low",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compile"] });
      setNewCollabOpen(false);
      setNcName("");
      setNcInitials("");
      setNcFile("");
      setNcFocus("");
      setNcLayer("");
    },
  });

  const deleteCollabMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/collaborators/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compile"] });
    },
  });

  if (versionsLoading || collabsLoading) {
    return (
      <div className="min-h-screen">
        <TopNav />
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_10%_10%,hsl(var(--chart-1)/0.18),transparent_60%),radial-gradient(900px_circle_at_80%_0%,hsl(var(--chart-2)/0.12),transparent_64%),radial-gradient(900px_circle_at_75%_86%,hsl(var(--chart-3)/0.14),transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/45" />
        <div className="absolute inset-0 grain" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex flex-col gap-6"
        >
          <header className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border bg-card shadow-sm">
                  <GitBranch className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1
                      className="text-balance text-2xl font-[650] tracking-tight"
                      data-testid="text-promptstudio-title"
                    >
                      Prompt Studio
                    </h1>
                    <Badge
                      variant="secondary"
                      className="border bg-card/70 backdrop-blur"
                      data-testid="badge-promptstudio-mode"
                    >
                      Versioning & collaboration
                    </Badge>
                  </div>
                  <p
                    className="mt-1 max-w-2xl text-sm text-muted-foreground"
                    data-testid="text-promptstudio-subtitle"
                  >
                    Treat prompts like build artifacts: collaborate in layers, compile deterministically, and review diffs before release.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="rounded-xl"
                    onClick={() => setActiveTab("diff")}
                    data-testid="button-open-diff"
                  >
                    <GitCommit className="mr-2 h-4 w-4" />
                    Review changes
                  </Button>
                  <Button
                    variant="secondary"
                    className="rounded-xl"
                    onClick={() => setActiveTab("collab")}
                    data-testid="button-open-collab"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Collaborators
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground" data-testid="text-selected-version">
                  Selected: <span className="font-medium text-foreground">{selected?.tag ?? "—"}</span>
                </div>
              </div>
            </div>

            {selected && (
              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border bg-card/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">Latest build</div>
                      <Badge className={`border ${statusTone(selected.status)}`} data-testid="badge-selected-status">
                        {formatStatus(selected.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xl font-[650] tracking-tight" data-testid="text-selected-tag">
                      {selected.tag}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground" data-testid="text-selected-meta">
                      {new Date(selected.createdAt).toLocaleString()} · {selected.author}
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-card/60 p-3">
                    <div className="text-xs text-muted-foreground">Layers</div>
                    <div className="mt-2 text-xl font-[650] tracking-tight" data-testid="text-selected-layers">
                      {selected.promptsCount}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground" data-testid="text-selected-layers-sub">
                      Base + collaborators merged
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-card/60 p-3">
                    <div className="text-xs text-muted-foreground">Compiled size</div>
                    <div className="mt-2 text-xl font-[650] tracking-tight" data-testid="text-selected-size">
                      {selected.compiledSize}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground" data-testid="text-selected-size-sub">
                      Ready to ship / publish
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </header>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2 rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium" data-testid="text-versions-title">Versions</div>
                  <div className="mt-1 text-xs text-muted-foreground" data-testid="text-versions-subtitle">
                    Browse builds and open diffs.
                  </div>
                </div>
                <Dialog open={newVersionOpen} onOpenChange={setNewVersionOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary" className="rounded-xl" data-testid="button-new-version">
                      <Plus className="mr-2 h-4 w-4" />
                      New
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create new version</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-3 py-2">
                      <div className="grid gap-1">
                        <Label>Tag</Label>
                        <Input
                          value={nvTag}
                          onChange={(e) => setNvTag(e.target.value)}
                          placeholder="e.g. v13"
                          data-testid="input-nv-tag"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label>Author</Label>
                        <Input
                          value={nvAuthor}
                          onChange={(e) => setNvAuthor(e.target.value)}
                          placeholder="Your name"
                          data-testid="input-nv-author"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label>Summary</Label>
                        <Textarea
                          value={nvSummary}
                          onChange={(e) => setNvSummary(e.target.value)}
                          placeholder="What changed in this build?"
                          data-testid="input-nv-summary"
                        />
                      </div>
                      <Button
                        className="rounded-xl"
                        disabled={!nvTag || !nvAuthor || !nvSummary || createVersionMutation.isPending}
                        onClick={() => createVersionMutation.mutate()}
                        data-testid="button-create-version"
                      >
                        {createVersionMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Create version
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search tag, author, summary…"
                    className="h-9 rounded-xl pl-9"
                    data-testid="input-version-search"
                  />
                </div>
                <Button
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => setQ("")}
                  data-testid="button-clear-search"
                >
                  Clear
                </Button>
              </div>

              <Separator className="my-4" />

              <ScrollArea className="h-[420px] pr-3" data-testid="scroll-versions">
                <div className="grid gap-2">
                  {filteredVersions.map((v) => {
                    const active = v.id === selected?.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={`group flex w-full items-start justify-between gap-3 rounded-2xl border bg-card/60 px-3 py-3 text-left shadow-sm transition hover:shadow ${
                          active ? "ring-2 ring-ring/25" : ""
                        }`}
                        data-testid={`button-version-${v.tag}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-[650] tracking-tight" data-testid={`text-version-tag-${v.tag}`}>
                              {v.tag}
                            </div>
                            <Badge className={`border ${statusTone(v.status)}`} data-testid={`badge-version-status-${v.tag}`}>
                              {formatStatus(v.status)}
                            </Badge>
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground" data-testid={`text-version-summary-${v.tag}`}>
                            {v.summary}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground" data-testid={`text-version-meta-${v.tag}`}>
                            <span className="inline-flex items-center gap-1">
                              <History className="h-3.5 w-3.5" />
                              {new Date(v.createdAt).toLocaleString()}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span className="inline-flex items-center gap-1">
                              <BookOpen className="h-3.5 w-3.5" />
                              {v.promptsCount} layers
                            </span>
                          </div>
                        </div>
                        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </Card>

            <Card className="lg:col-span-3 rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as typeof activeTab)}
              >
                <TabsList className="grid w-full grid-cols-3 rounded-2xl border bg-card/60 p-1 shadow-sm backdrop-blur">
                  <TabsTrigger value="versions" className="rounded-xl" data-testid="tab-overview">
                    <Settings2 className="mr-2 h-4 w-4" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="diff" className="rounded-xl" data-testid="tab-diff">
                    <GitMerge className="mr-2 h-4 w-4" />
                    Diff
                  </TabsTrigger>
                  <TabsTrigger value="collab" className="rounded-xl" data-testid="tab-collab">
                    <Users className="mr-2 h-4 w-4" />
                    Collaborators
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="versions" className="mt-4">
                  <div className="grid gap-4">
                    <Card className="rounded-2xl border bg-card/60 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium" data-testid="text-compiled-title">
                            Compiled prompt preview
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground" data-testid="text-compiled-subtitle">
                            This is what the app would load as the final prompt build.
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          className="rounded-xl"
                          onClick={() => copyToClipboard(compiledPreview)}
                          data-testid="button-copy-compiled"
                        >
                          <Clipboard className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                      <div
                        className="mt-3 rounded-2xl border bg-card/50 p-3 font-mono text-xs leading-relaxed text-foreground/90"
                        data-testid="text-compiled-preview"
                      >
                        <pre className="whitespace-pre-wrap">{compiledPreview}</pre>
                      </div>
                    </Card>

                    {selected && (
                      <Card className="rounded-2xl border bg-card/60 p-4 shadow-sm">
                        <div className="text-sm font-medium" data-testid="text-build-manifest-title">
                          Build manifest
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground" data-testid="text-build-manifest-subtitle">
                          Metadata stored per build.
                        </div>
                        <Separator className="my-3" />
                        <div className="grid gap-2 text-sm">
                          <div className="flex items-center justify-between" data-testid="manifest-build">
                            <span className="text-muted-foreground">build_id</span>
                            <span className="font-medium">{selected.tag}</span>
                          </div>
                          <div className="flex items-center justify-between" data-testid="manifest-authors">
                            <span className="text-muted-foreground">authors</span>
                            <span className="font-medium">{selected.author}</span>
                          </div>
                          <div className="flex items-center justify-between" data-testid="manifest-layers">
                            <span className="text-muted-foreground">layers</span>
                            <span className="font-medium">{selected.promptsCount}</span>
                          </div>
                          <div className="flex items-center justify-between" data-testid="manifest-created">
                            <span className="text-muted-foreground">created_at</span>
                            <span className="font-medium">{new Date(selected.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <Separator className="my-3" />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            className="rounded-xl"
                            disabled={selected.status === "released" || releaseVersionMutation.isPending}
                            onClick={() => releaseVersionMutation.mutate(selected.id)}
                            data-testid="button-release-version"
                          >
                            {selected.status === "released" ? "Already released" : "Mark as released"}
                          </Button>
                          <Button
                            variant="destructive"
                            className="rounded-xl"
                            disabled={deleteVersionMutation.isPending}
                            onClick={() => {
                              if (confirm("Delete this version?")) deleteVersionMutation.mutate(selected.id);
                            }}
                            data-testid="button-delete-version"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="diff" className="mt-4">
                  <Card className="rounded-2xl border bg-card/60 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium" data-testid="text-diff-title">
                          Diff
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground" data-testid="text-diff-subtitle">
                          Compare the selected build with the previous version.
                        </div>
                      </div>
                      <Badge variant="secondary" className="rounded-xl" data-testid="badge-diff-range">
                        {diffData ? `${diffData.from} → ${diffData.to}` : selected?.tag ?? "—"}
                      </Badge>
                    </div>

                    <Separator className="my-3" />

                    {diffLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : diffData && diffData.diff.length > 0 ? (
                      <div className="rounded-2xl border bg-card/50 p-2" data-testid="panel-diff">
                        <div className="grid gap-1">
                          {diffData.diff.map((l, i) => (
                            <div
                              key={i}
                              className={`flex items-start gap-3 rounded-xl border px-3 py-2 ${diffTone(l.type)}`}
                              data-testid={`diff-line-${i}`}
                            >
                              <div
                                className="mt-0.5 w-8 shrink-0 font-mono text-[11px] text-muted-foreground"
                                aria-hidden
                              >
                                {l.type === "add" ? "+" : l.type === "del" ? "-" : "·"}
                              </div>
                              <div className="min-w-0 flex-1 font-mono text-[12px] leading-relaxed">
                                {l.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        {!compareId
                          ? "No previous version to compare against."
                          : "No differences found."}
                      </div>
                    )}

                    {selected && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          className="rounded-xl"
                          disabled={selected.status === "released" || releaseVersionMutation.isPending}
                          onClick={() => releaseVersionMutation.mutate(selected.id)}
                          data-testid="button-approve-build"
                        >
                          Approve build
                        </Button>
                      </div>
                    )}
                  </Card>
                </TabsContent>

                <TabsContent value="collab" className="mt-4">
                  <div className="grid gap-4">
                    <Card className="rounded-2xl border bg-card/60 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium" data-testid="text-collab-title">
                            Collaborator layers
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground" data-testid="text-collab-subtitle">
                            Each person contributes a markdown layer that gets merged into the compiled prompt.
                          </div>
                        </div>
                        <Dialog open={newCollabOpen} onOpenChange={setNewCollabOpen}>
                          <DialogTrigger asChild>
                            <Button variant="secondary" className="rounded-xl" data-testid="button-add-collaborator">
                              <Plus className="mr-2 h-4 w-4" />
                              Add
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add collaborator</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-3 py-2">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-1">
                                  <Label>Name</Label>
                                  <Input value={ncName} onChange={(e) => setNcName(e.target.value)} placeholder="Jane" data-testid="input-nc-name" />
                                </div>
                                <div className="grid gap-1">
                                  <Label>Initials</Label>
                                  <Input value={ncInitials} onChange={(e) => setNcInitials(e.target.value)} placeholder="JA" data-testid="input-nc-initials" />
                                </div>
                              </div>
                              <div className="grid gap-1">
                                <Label>File path</Label>
                                <Input value={ncFile} onChange={(e) => setNcFile(e.target.value)} placeholder="prompts/collaborators/jane.md" data-testid="input-nc-file" />
                              </div>
                              <div className="grid gap-1">
                                <Label>Focus area</Label>
                                <Input value={ncFocus} onChange={(e) => setNcFocus(e.target.value)} placeholder="e.g. Tone + voice" data-testid="input-nc-focus" />
                              </div>
                              <div className="grid gap-1">
                                <Label>Layer content (markdown)</Label>
                                <Textarea
                                  value={ncLayer}
                                  onChange={(e) => setNcLayer(e.target.value)}
                                  placeholder="## Your Section\n\n- Instructions here..."
                                  rows={5}
                                  data-testid="input-nc-layer"
                                />
                              </div>
                              <Button
                                className="rounded-xl"
                                disabled={!ncName || !ncInitials || !ncFile || !ncFocus || createCollabMutation.isPending}
                                onClick={() => createCollabMutation.mutate()}
                                data-testid="button-create-collab"
                              >
                                {createCollabMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Add collaborator
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>

                      <div className="mt-3 rounded-2xl border bg-card/50" data-testid="table-collaborators">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[34%]">Collaborator</TableHead>
                              <TableHead className="w-[24%]">Focus</TableHead>
                              <TableHead className="w-[24%]">File</TableHead>
                              <TableHead className="w-[10%] text-right">Risk</TableHead>
                              <TableHead className="w-[8%]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {collabs.map((c) => (
                              <TableRow key={c.id} className="hover:bg-muted/30" data-testid={`row-collab-${c.name.toLowerCase()}`}>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="grid h-9 w-9 place-items-center rounded-xl border bg-card"
                                      data-testid={`avatar-${c.name.toLowerCase()}`}
                                    >
                                      <span className="text-xs font-[650]">{c.initials}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium" data-testid={`text-collab-name-${c.name.toLowerCase()}`}>
                                        {c.name}
                                      </div>
                                      <div className="mt-0.5 text-xs text-muted-foreground" data-testid={`text-collab-last-${c.name.toLowerCase()}`}>
                                        Last edited {timeAgo(c.lastEditedAt)}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm" data-testid={`text-collab-focus-${c.name.toLowerCase()}`}>
                                  {c.focus}
                                </TableCell>
                                <TableCell>
                                  <code className="rounded bg-muted/40 px-2 py-1 text-[11px]" data-testid={`text-collab-file-${c.name.toLowerCase()}`}>
                                    {c.file}
                                  </code>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge className={`border ${cnRisk(c.risk)}`} data-testid={`badge-collab-risk-${c.name.toLowerCase()}`}>
                                    {c.risk}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg"
                                    onClick={() => {
                                      if (confirm(`Remove ${c.name}?`)) deleteCollabMutation.mutate(c.id);
                                    }}
                                    data-testid={`button-delete-collab-${c.name.toLowerCase()}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="mt-3 text-xs text-muted-foreground" data-testid="text-collab-note">
                        Compilation order is deterministic (alphabetical by collaborator filename).
                      </div>
                    </Card>

                    <Card className="rounded-2xl border bg-card/60 p-4 shadow-sm">
                      <div className="text-sm font-medium" data-testid="text-changelog-title">
                        Changelog
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-changelog-subtitle">
                        Release notes from recent builds.
                      </div>
                      <Separator className="my-3" />
                      <div className="grid gap-2">
                        {versions.slice(0, 5).map((v) => (
                          <div
                            key={v.id}
                            className="flex items-start justify-between rounded-xl border bg-card/50 px-3 py-2"
                            data-testid={`row-changelog-${v.tag}`}
                          >
                            <div className="text-sm font-medium">{v.summary}</div>
                            <Badge variant="secondary" className="shrink-0 rounded-xl">
                              {v.tag}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/70 px-4 py-3 text-sm shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-muted-foreground" data-testid="status-footer">
              <span className="inline-flex items-center gap-2">
                <GitCommit className="h-4 w-4" />
                {versions.length} versions · {collabs.length} collaborators
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button className="rounded-xl" data-testid="button-publish-build">
                Publish build
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
