"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Globe, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/primitives";
import { Dialog } from "@/components/shell/Dialog";
import { api, ClientError, queryKeys } from "@/lib/client";
import type { User } from "@/db/schema";
import { useUiStore } from "@/store/ui";

interface EditProfileModalProps {
  user: User;
}

export function EditProfileModal({ user }: EditProfileModalProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useUiStore((s) => s.notify);

  const [displayName, setDisplayName] = useState(user.displayName);
  const [headline, setHeadline] = useState(user.headline);
  const [bio, setBio] = useState(user.bio);
  const [skills, setSkills] = useState<string[]>(user.skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const [githubUrl, setGithubUrl] = useState(user.githubUrl ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(user.portfolioUrl ?? "");
  const [avatarHue, setAvatarHue] = useState(user.avatarHue);

  const addSkill = () => {
    const s = skillInput.trim();
    if (!s) return;
    if (skills.includes(s)) return setSkillInput("");
    if (skills.length >= 20) return notify("Maximum 20 skills allowed", "info");
    setSkills([...skills, s]);
    setSkillInput("");
  };

  const removeSkill = (s: string) => {
    setSkills(skills.filter((item) => item !== s));
  };

  const mutation = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; user: Partial<User> }>("/api/me", {
        method: "PATCH",
        json: {
          displayName,
          headline,
          bio,
          skills,
          githubUrl: githubUrl || null,
          portfolioUrl: portfolioUrl || null,
          avatarHue,
        },
      }),
    onSuccess: () => {
      notify("Profile updated successfully", "success");
      qc.invalidateQueries({ queryKey: queryKeys.user(user.username) });
      setOpen(false);
      router.refresh();
    },
    onError: (err) => {
      notify(err instanceof ClientError ? err.message : "Failed to update profile", "error");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return notify("Display name is required", "error");
    mutation.mutate();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-sm inline-flex items-center gap-1.5"
      >
        <Pencil size={13} /> Edit Profile
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit Profile"
        description="Update your practitioner identity, skills, and portfolio links."
        className="max-w-lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center gap-4 rounded-md border border-line bg-sunken p-3">
            <Avatar hue={avatarHue} name={displayName || user.username} size={50} />
            <div className="flex-1 min-w-0">
              <label htmlFor="avatar-hue" className="eyebrow block mb-1">
                Avatar Hue ({avatarHue}°)
              </label>
              <input
                id="avatar-hue"
                type="range"
                min="0"
                max="360"
                value={avatarHue}
                onChange={(e) => setAvatarHue(Number(e.target.value))}
                className="w-full cursor-pointer accent-[var(--ember)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="display-name" className="eyebrow block mb-1">
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="field h-9 text-[13.5px]"
              maxLength={80}
            />
          </div>

          <div>
            <label htmlFor="headline" className="eyebrow block mb-1">
              Professional Headline
            </label>
            <input
              id="headline"
              type="text"
              placeholder="e.g. Distributed Systems Engineer · Rust & Go"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="field h-9 text-[13.5px]"
              maxLength={140}
            />
          </div>

          <div>
            <label htmlFor="bio" className="eyebrow block mb-1">
              Bio
            </label>
            <textarea
              id="bio"
              rows={3}
              placeholder="Brief overview of your experience, specialty, and availability."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="field py-2 text-[13.5px] leading-relaxed resize-none"
              maxLength={2000}
            />
          </div>

          <div>
            <label htmlFor="skills-input" className="eyebrow block mb-1">
              Skills & Specialties
            </label>
            <div className="flex gap-2 mb-2">
              <input
                id="skills-input"
                type="text"
                placeholder="Type a skill and press Enter"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                className="field h-8 text-[12.5px]"
                maxLength={30}
              />
              <button
                type="button"
                onClick={addSkill}
                className="btn btn-sm shrink-0"
              >
                <Plus size={13} /> Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[30px]">
              {skills.map((s) => (
                <span
                  key={s}
                  className="tag inline-flex items-center gap-1 pr-1 text-[11.5px]"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSkill(s)}
                    className="rounded-full p-0.5 hover:bg-surface text-ink-3 hover:text-ink"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label htmlFor="github-url" className="eyebrow block mb-1 inline-flex items-center gap-1">
                <GitBranch size={11} /> GitHub URL
              </label>
              <input
                id="github-url"
                type="text"
                placeholder="https://github.com/username"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="field h-8 text-[12.5px]"
              />
            </div>
            <div>
              <label htmlFor="portfolio-url" className="eyebrow block mb-1 inline-flex items-center gap-1">
                <Globe size={11} /> Portfolio / Site
              </label>
              <input
                id="portfolio-url"
                type="text"
                placeholder="https://yourdomain.com"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                className="field h-8 text-[12.5px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-line">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-ghost h-9 px-4 text-[13px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary h-9 px-4 text-[13px]"
            >
              {mutation.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
