"use client";

import { useMutation } from "@tanstack/react-query";
import { Compass, Plus, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientError } from "@/lib/client";
import type { Space } from "@/db/schema";
import { routes, slugify } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

export function CreateSpaceForm() {
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [accentHue, setAccentHue] = useState(210);
  const [privacy, setPrivacy] = useState<Space["privacy"]>("public");

  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");

  const [rules, setRules] = useState<string[]>([
    "Keep discussions professional and outcome-focused.",
    "Share working code and reproducible examples.",
    "No spam, unsolicited pitches, or automated content.",
  ]);
  const [ruleInput, setRuleInput] = useState("");

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug) {
      setSlug(slugify(val, 48));
    }
  };

  const addTopic = () => {
    const t = slugify(topicInput.trim(), 24);
    if (!t) return;
    if (topics.includes(t)) return setTopicInput("");
    if (topics.length >= 8) return notify("Maximum 8 topics allowed", "info");
    setTopics([...topics, t]);
    setTopicInput("");
  };

  const removeTopic = (t: string) => {
    setTopics(topics.filter((item) => item !== t));
  };

  const addRule = () => {
    const r = ruleInput.trim();
    if (!r) return;
    if (rules.length >= 8) return notify("Maximum 8 rules allowed", "info");
    setRules([...rules, r]);
    setRuleInput("");
  };

  const removeRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  const mutation = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; space: Space }>("/api/spaces", {
        method: "POST",
        json: {
          name,
          slug,
          tagline,
          description,
          accentHue,
          privacy,
          topics,
          rules,
        },
      }),
    onSuccess: (data) => {
      notify(`Space b/${data.space.slug} created successfully!`, "success");
      router.push(routes.space(data.space.slug));
      router.refresh();
    },
    onError: (err) => {
      notify(err instanceof ClientError ? err.message : "Failed to create space", "error");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return notify("Space name is required", "error");
    if (!slug.trim()) return notify("Slug is required", "error");
    mutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="panel rounded-lg p-5 sm:p-7 space-y-5">
      {/* Live Badge Preview */}
      <div className="flex items-center gap-4 rounded-md border border-line bg-sunken p-4">
        <span
          className="h-12 w-12 shrink-0 rounded-lg shadow-sm transition-colors"
          style={{
            background: `linear-gradient(135deg, hsl(${accentHue} 65% 50%), hsl(${(accentHue + 30) % 360} 60% 35%))`,
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="num text-[16px] font-bold text-ink">
              b/{slug || "new-space"}
            </span>
            <span className="tag capitalize">{privacy}</span>
          </div>
          <p className="text-[12.5px] text-ink-3 truncate">
            {name || "Your Community Name"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="space-name" className="eyebrow block mb-1">
            Community Name *
          </label>
          <input
            id="space-name"
            type="text"
            required
            placeholder="e.g. Distributed Systems"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="field h-9 text-[13.5px]"
            maxLength={80}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="space-slug" className="eyebrow block">
              URL Slug *
            </label>
            <button
              type="button"
              onClick={() => setAutoSlug(!autoSlug)}
              className="text-[11px] text-ember hover:underline font-medium"
            >
              {autoSlug ? "Custom slug" : "Auto slug"}
            </button>
          </div>
          <div className="flex items-center rounded-md border border-line bg-surface">
            <span className="px-2.5 text-[12px] font-mono text-ink-3">b/</span>
            <input
              id="space-slug"
              type="text"
              required
              readOnly={autoSlug}
              placeholder="distributed-systems"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value, 48))}
              className="field h-9 border-0 bg-transparent text-[13.5px] font-mono pl-0"
              maxLength={48}
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="accent-hue" className="eyebrow block mb-1">
          Brand Hue Accent ({accentHue}°)
        </label>
        <input
          id="accent-hue"
          type="range"
          min="0"
          max="360"
          value={accentHue}
          onChange={(e) => setAccentHue(Number(e.target.value))}
          className="w-full cursor-pointer accent-[var(--ember)]"
        />
      </div>

      <div>
        <label htmlFor="tagline" className="eyebrow block mb-1">
          Tagline
        </label>
        <input
          id="tagline"
          type="text"
          placeholder="Brief one-line premise for practitioners in this vertical."
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="field h-9 text-[13.5px]"
          maxLength={140}
        />
      </div>

      <div>
        <label htmlFor="description" className="eyebrow block mb-1">
          Overview & Charter
        </label>
        <textarea
          id="description"
          rows={3}
          placeholder="Describe what kind of problems, architectures, and outcomes this space explores."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="field py-2 text-[13.5px] leading-relaxed resize-none"
          maxLength={4000}
        />
      </div>

      <div>
        <label htmlFor="privacy" className="eyebrow block mb-1">
          Space Access Policy
        </label>
        <select
          id="privacy"
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value as Space["privacy"])}
          className="field h-9 text-[13px]"
        >
          <option value="public">Public (Anyone can view and post)</option>
          <option value="restricted">Restricted (Publicly readable, posting requires approved membership)</option>
          <option value="private">Private (Invite-only members and moderators)</option>
        </select>
      </div>

      <div>
        <label htmlFor="topics-input" className="eyebrow block mb-1">
          Topics & Tags
        </label>
        <div className="flex gap-2 mb-2">
          <input
            id="topics-input"
            type="text"
            placeholder="Add keyword and press Enter (e.g. raft, kafka, kubernetes)"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTopic();
              }
            }}
            className="field h-8 text-[12.5px]"
          />
          <button type="button" onClick={addTopic} className="btn btn-sm shrink-0">
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <span key={t} className="tag inline-flex items-center gap-1 pr-1 text-[11.5px]">
              {t}
              <button
                type="button"
                onClick={() => removeTopic(t)}
                className="rounded-full p-0.5 hover:bg-surface text-ink-3 hover:text-ink"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="rules-input" className="eyebrow block mb-1">
          Community Guidelines & Rules
        </label>
        <div className="flex gap-2 mb-2">
          <input
            id="rules-input"
            type="text"
            placeholder="Add custom rule..."
            value={ruleInput}
            onChange={(e) => setRuleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRule();
              }
            }}
            className="field h-8 text-[12.5px]"
          />
          <button type="button" onClick={addRule} className="btn btn-sm shrink-0">
            <Plus size={13} /> Add Rule
          </button>
        </div>
        <ul className="space-y-1 text-[12.5px] text-ink-2">
          {rules.map((r, i) => (
            <li key={i} className="flex items-center justify-between rounded bg-sunken px-2.5 py-1.5">
              <span>
                <span className="num font-semibold text-ink-3 mr-2">{i + 1}.</span> {r}
              </span>
              <button
                type="button"
                onClick={() => removeRule(i)}
                className="text-ink-3 hover:text-danger ml-2"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-line">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn btn-ghost h-9 px-4 text-[13px]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn btn-primary h-9 px-5 text-[13px]"
        >
          {mutation.isPending ? "Creating space…" : "Launch Community"}
        </button>
      </div>
    </form>
  );
}
