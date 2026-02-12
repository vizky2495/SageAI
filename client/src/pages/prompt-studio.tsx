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
  Plus,
  Search,
  Settings2,
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

type PromptVersion = {
  id: string;
  tag: string;
  createdAt: string;
  author: string;
  summary: string;
  status: "latest" | "released" | "draft";
  promptsCount: number;
  compiledSize: string;
};

type Collaborator = {
  id: string;
  name: string;
  initials: string;
  file: string;
  focus: string;
  lastEdited: string;
  risk: "low" | "medium" | "high";
};

type DiffLine = {
  type: "add" | "del" | "ctx";
  text: string;
};

const versionsSeed: PromptVersion[] = [
  {
    id: "v12",
    tag: "v12",
    createdAt: "2026-02-12 09:18",
    author: "Release Bot",
    summary: "Adds content-type filters + deterministic compilation footer.",
    status: "latest",
    promptsCount: 6,
    compiledSize: "18.4 KB",
  },
  {
    id: "v11",
    tag: "v11",
    createdAt: "2026-02-11 17:42",
    author: "Vishal",
    summary: "Refines funnel stage tie-breakers + schema mapping notes.",
    status: "released",
    promptsCount: 5,
    compiledSize: "17.9 KB",
  },
  {
    id: "v10",
    tag: "v10",
    createdAt: "2026-02-10 13:06",
    author: "Petar",
    summary: "Adds changelog + build manifest metadata fields.",
    status: "released",
    promptsCount: 5,
    compiledSize: "17.1 KB",
  },
  {
    id: "v9",
    tag: "v9",
    createdAt: "2026-02-09 10:28",
    author: "Rashmita",
    summary: "Adds safety rules + conflict resolution guidance.",
    status: "released",
    promptsCount: 4,
    compiledSize: "15.6 KB",
  },
  {
    id: "v8",
    tag: "v8",
    createdAt: "2026-02-08 08:15",
    author: "Pavan",
    summary: "Introduces collaborators folder + staging compiled prompt.",
    status: "released",
    promptsCount: 4,
    compiledSize: "14.8 KB",
  },
];

const collaboratorsSeed: Collaborator[] = [
  {
    id: "vishal",
    name: "Vishal",
    initials: "VI",
    file: "prompts/collaborators/vishal.md",
    focus: "Schema mapping + metrics",
    lastEdited: "2h ago",
    risk: "low",
  },
  {
    id: "petar",
    name: "Petar",
    initials: "PE",
    file: "prompts/collaborators/petar.md",
    focus: "Build manifests + changelog",
    lastEdited: "Yesterday",
    risk: "low",
  },
  {
    id: "rashmita",
    name: "Rashmita",
    initials: "RA",
    file: "prompts/collaborators/rashmita.md",
    focus: "Safety + guardrails",
    lastEdited: "3d ago",
    risk: "medium",
  },
  {
    id: "pavan",
    name: "Pavan",
    initials: "PA",
    file: "prompts/collaborators/pavankumar.md",
    focus: "Collab workflow + review",
    lastEdited: "6d ago",
    risk: "low",
  },
];

const diffSeed: DiffLine[] = [
  { type: "ctx", text: "## 5. Task Instructions – Dashboard Generation" },
  { type: "ctx", text: "When you are given CSV-derived data..." },
  {
    type: "add",
    text: "- Add content search + content type filters to drilldowns.",
  },
  {
    type: "add",
    text: "- Merge collaborator prompts in deterministic alphabetical order.",
  },
  {
    type: "add",
    text: "- Append build footer (build #, timestamp, authors).",
  },
  {
    type: "del",
    text: "- Manually combine prompt fragments before review.",
  },
  { type: "ctx", text: "---" },
  { type: "ctx", text: "notes: QDC is skipped (no QDC data)." },
];

function cnRisk(risk: Collaborator["risk"]) {
  if (risk === "high") return "bg-destructive/12 text-destructive border-destructive/20";
  if (risk === "medium")
    return "bg-chart-4/10 text-chart-4 border-chart-4/20";
  return "bg-chart-1/10 text-chart-3 border-chart-1/20";
}

function formatStatus(s: PromptVersion["status"]) {
  if (s === "latest") return "Latest";
  if (s === "draft") return "Draft";
  return "Released";
}

function statusTone(s: PromptVersion["status"]) {
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

export default function PromptStudio() {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(versionsSeed[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<"versions" | "collab" | "diff">(
    "versions",
  );

  const selected = useMemo(
    () => versionsSeed.find((v) => v.id === selectedId) || versionsSeed[0],
    [selectedId],
  );

  const filteredVersions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return versionsSeed;
    return versionsSeed.filter((v) => {
      return (
        v.tag.toLowerCase().includes(s) ||
        v.author.toLowerCase().includes(s) ||
        v.summary.toLowerCase().includes(s)
      );
    });
  }, [q]);

  const compiledPreview = useMemo(() => {
    return `# Content Intelligence Analyst — Compiled Prompt (${selected.tag})

Build: ${selected.tag}
Created: ${selected.createdAt}
Authors: ${selected.author}

---

## What’s included
- Base prompt
- Collaborator layers (${selected.promptsCount}) merged alphabetically
- Footer metadata (build #, timestamp, authors)

## Notes
- QDC metrics are not included (no QDC data)
- Funnel stage classification: BOFU > MOFU > TOFU > UNKNOWN
`;
  }, [selected]);

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
                    onClick={() => {
                      setActiveTab("diff");
                    }}
                    data-testid="button-open-diff"
                  >
                    <GitCommit className="mr-2 h-4 w-4" />
                    Review changes
                  </Button>
                  <Button
                    variant="secondary"
                    className="rounded-xl"
                    onClick={() => {
                      setActiveTab("collab");
                    }}
                    data-testid="button-open-collab"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Collaborators
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground" data-testid="text-selected-version">
                  Selected: <span className="font-medium text-foreground">{selected.tag}</span>
                </div>
              </div>
            </div>

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
                    {selected.createdAt} · {selected.author}
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
                <Button variant="secondary" className="rounded-xl" data-testid="button-new-version">
                  <Plus className="mr-2 h-4 w-4" />
                  New
                </Button>
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
                    const active = v.id === selectedId;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={`group flex w-full items-start justify-between gap-3 rounded-2xl border bg-card/60 px-3 py-3 text-left shadow-sm transition hover:shadow ${
                          active ? "ring-2 ring-ring/25" : ""
                        }`}
                        data-testid={`button-version-${v.id}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-[650] tracking-tight" data-testid={`text-version-tag-${v.id}`}>
                              {v.tag}
                            </div>
                            <Badge className={`border ${statusTone(v.status)}`} data-testid={`badge-version-status-${v.id}`}>
                              {formatStatus(v.status)}
                            </Badge>
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground" data-testid={`text-version-summary-${v.id}`}>
                            {v.summary}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground" data-testid={`text-version-meta-${v.id}`}>
                            <span className="inline-flex items-center gap-1">
                              <History className="h-3.5 w-3.5" />
                              {v.createdAt}
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

                    <Card className="rounded-2xl border bg-card/60 p-4 shadow-sm">
                      <div className="text-sm font-medium" data-testid="text-build-manifest-title">
                        Build manifest (mock)
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-build-manifest-subtitle">
                        Metadata you’ll likely store per build.
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
                          <span className="font-medium">{selected.createdAt}</span>
                        </div>
                      </div>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="diff" className="mt-4">
                  <Card className="rounded-2xl border bg-card/60 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium" data-testid="text-diff-title">
                          Diff (mock)
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground" data-testid="text-diff-subtitle">
                          Compare the selected build with the previous version.
                        </div>
                      </div>
                      <Badge variant="secondary" className="rounded-xl" data-testid="badge-diff-range">
                        {selected.tag} → prev
                      </Badge>
                    </div>

                    <Separator className="my-3" />

                    <div className="rounded-2xl border bg-card/50 p-2" data-testid="panel-diff">
                      <div className="grid gap-1">
                        {diffSeed.map((l, i) => (
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

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button className="rounded-xl" data-testid="button-approve-build">
                        Approve build
                      </Button>
                      <Button variant="secondary" className="rounded-xl" data-testid="button-request-changes">
                        Request changes
                      </Button>
                    </div>
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
                        <Button variant="secondary" className="rounded-xl" data-testid="button-add-collaborator">
                          <Plus className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                      </div>

                      <div className="mt-3 rounded-2xl border bg-card/50" data-testid="table-collaborators">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[34%]">Collaborator</TableHead>
                              <TableHead className="w-[28%]">Focus</TableHead>
                              <TableHead className="w-[28%]">File</TableHead>
                              <TableHead className="text-right">Risk</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {collaboratorsSeed.map((c) => (
                              <TableRow key={c.id} className="hover:bg-muted/30" data-testid={`row-collab-${c.id}`}>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="grid h-9 w-9 place-items-center rounded-xl border bg-card"
                                      data-testid={`avatar-${c.id}`}
                                    >
                                      <span className="text-xs font-[650]">{c.initials}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium" data-testid={`text-collab-name-${c.id}`}>
                                        {c.name}
                                      </div>
                                      <div className="mt-0.5 text-xs text-muted-foreground" data-testid={`text-collab-last-${c.id}`}>
                                        Last edited {c.lastEdited}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm" data-testid={`text-collab-focus-${c.id}`}>
                                  {c.focus}
                                </TableCell>
                                <TableCell>
                                  <code className="rounded bg-muted/40 px-2 py-1 text-[11px]" data-testid={`text-collab-file-${c.id}`}>
                                    {c.file}
                                  </code>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge className={`border ${cnRisk(c.risk)}`} data-testid={`badge-collab-risk-${c.id}`}>
                                    {c.risk}
                                  </Badge>
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
                        Changelog (mock)
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-changelog-subtitle">
                        Release notes generated for each build.
                      </div>
                      <Separator className="my-3" />
                      <div className="grid gap-2">
                        {["Added content search filters", "Appended build footer metadata", "Improved conflict highlighting"].map(
                          (item, i) => (
                            <div
                              key={i}
                              className="flex items-start justify-between rounded-xl border bg-card/50 px-3 py-2"
                              data-testid={`row-changelog-${i}`}
                            >
                              <div className="text-sm font-medium">{item}</div>
                              <Badge variant="secondary" className="rounded-xl">
                                {selected.tag}
                              </Badge>
                            </div>
                          ),
                        )}
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
                Mock UI only — no backend writes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="rounded-xl" data-testid="button-open-settings">
                <Settings2 className="mr-2 h-4 w-4" />
                Settings
              </Button>
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
