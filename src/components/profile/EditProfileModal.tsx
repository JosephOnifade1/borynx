"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Globe, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Avatar } from "@/components/primitives";
import { Dialog } from "@/components/shell/Dialog";
import { api, ClientError, queryKeys } from "@/lib/client";
import type { EditableProfile } from "@/lib/profile-input";
import { useUiStore } from "@/store/ui";
import { ProfileIntentFields, profileIntentForm } from "./ProfileIntentFields";

export function EditProfileModal({ user }: { user: EditableProfile }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useUiStore((s) => s.notify);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user.displayName);
  const [headline, setHeadline] = useState(user.headline);
  const [bio, setBio] = useState(user.bio);
  const [skills, setSkills] = useState<string[]>(user.skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const [githubUrl, setGithubUrl] = useState(user.githubUrl ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(user.portfolioUrl ?? "");
  const [avatarHue, setAvatarHue] = useState(user.avatarHue);
  const [intent, setIntent] = useState(() => profileIntentForm(user));

  const handleOpen = () => {
    // Sync with latest user data on open
    setDisplayName(user.displayName);
    setHeadline(user.headline);
    setBio(user.bio);
    setSkills(user.skills ?? []);
    setSkillInput("");
    setGithubUrl(user.githubUrl ?? "");
    setPortfolioUrl(user.portfolioUrl ?? "");
    setAvatarHue(user.avatarHue);
    setIntent(profileIntentForm(user));
    mutation.reset();
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const addSkill = () => {
    const s = skillInput.trim();
    if (!s) return;
    if (skills.some((item) => item.toLowerCase() === s.toLowerCase())) {
      setSkillInput("");
      return;
    }
    if (skills.length >= 20) {
      notify("Maximum 20 skills allowed", "info");
      return;
    }
    setSkills([...skills, s]);
    setSkillInput("");
  };

  const removeSkill = (s: string) => {
    setSkills(skills.filter((item) => item !== s));
  };

  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api<{ ok: boolean }>("/api/me", { method: "PATCH", json: patch }),
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
    if (mutation.isPending) return;
    const saved = profileIntentForm(user);
    const patch = {
      ...(displayName !== user.displayName && { displayName }),
      ...(headline !== user.headline && { headline }),
      ...(bio !== user.bio && { bio }),
      ...(skills !== user.skills && { skills }),
      ...(avatarHue !== user.avatarHue && { avatarHue }),
      ...(githubUrl !== (user.githubUrl ?? "") && { githubUrl: githubUrl.trim() || null }),
      ...(portfolioUrl !== (user.portfolioUrl ?? "") && { portfolioUrl: portfolioUrl.trim() || null }),
      ...(intent.lookingToHire !== saved.lookingToHire && { lookingToHire: intent.lookingToHire }),
      ...(intent.availableForWork !== saved.availableForWork && { availableForWork: intent.availableForWork }),
      // A disabled intent keeps its saved details, not any unsaved edits to hidden fields.
      ...(intent.lookingToHire && intent.companyName !== saved.companyName && { companyName: intent.companyName.trim() || null }),
      ...(intent.lookingToHire && intent.companyUrl !== saved.companyUrl && { companyUrl: intent.companyUrl.trim() || null }),
      ...(intent.availableForWork && (intent.hourlyRate !== saved.hourlyRate || intent.hourlyCurrency !== saved.hourlyCurrency) && {
        hourlyRate: intent.hourlyRate ? Number(intent.hourlyRate) : null,
        hourlyCurrency: intent.hourlyRate ? intent.hourlyCurrency : null,
      }),
    };
    if (!Object.keys(patch).length) return handleClose();
    mutation.mutate(patch);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="btn btn-sm inline-flex items-center gap-1.5"
      >
        <Pencil size={13} /> Edit Profile
      </button>

      <Dialog
        open={open}
        onClose={handleClose}
        initialFocusRef={nameInputRef}
        title="Edit Profile"
        description="Update the details and marketplace signals on your public profile."
        className="max-w-lg"
      >
        <form method="post" onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          {/* Scrollable Form Content */}
          <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
            <ProfileIntentFields value={intent} onChange={setIntent} errors={mutation.error instanceof ClientError ? mutation.error.fields : undefined} />

            {/* Avatar Hue Picker */}
            <div className="flex items-center gap-4 rounded-md border border-line bg-sunken p-3">
              <Avatar hue={avatarHue} name={displayName || user.username} size={48} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="avatar-hue" className="eyebrow block">
                    Avatar Hue Accent
                  </label>
                  <span className="num text-[11px] text-ink-3">{avatarHue}°</span>
                </div>
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

            {/* Display Name */}
            <div>
              <label htmlFor="display-name" className="eyebrow block mb-1">
                Display Name *
              </label>
              <input
                ref={nameInputRef}
                id="display-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="field h-9 text-[13.5px]"
                maxLength={80}
              />
            </div>

            {/* Professional Headline */}
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

            {/* Bio */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="bio" className="eyebrow block">
                  Bio
                </label>
                <span className="num text-[10.5px] text-ink-4">{bio.length}/2000</span>
              </div>
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

            {/* Skills & Specialties */}
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

              <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                {skills.length === 0 ? (
                  <span className="text-[12px] text-ink-4 italic">No skills added yet.</span>
                ) : (
                  skills.map((s) => (
                    <span
                      key={s}
                      className="tag inline-flex items-center gap-1 pr-1 text-[11.5px]"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => removeSkill(s)}
                        className="rounded-full p-0.5 hover:bg-surface text-ink-3 hover:text-ink"
                        aria-label={`Remove skill ${s}`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Social Links */}
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
          </div>

          {mutation.isError && <p role="alert" className="hairline-t shrink-0 px-5 pt-2 text-[12.5px] text-danger">{mutation.error.message}</p>}
          {/* Sticky Dialog Footer */}
          <div className="hairline-t flex items-center justify-end gap-2 px-5 py-3 bg-sunken/40 shrink-0">
            <button
              type="button"
              onClick={handleClose}
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
