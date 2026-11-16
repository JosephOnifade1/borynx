import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { getCurrentUser } from "@/lib/auth";
import { routes, timeAgo } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Settings — Borynx",
  description: "Manage your freelancer profile, identity, and preferences.",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(routes.login());
  }

  return (
    <PageFrame
      stream
      header={
        <PageHeader
          eyebrow="Account & Preferences"
          title="Profile Settings"
          description="Update your practitioner identity, skills, and links displayed across threads and leads."
        />
      }
    >
      <div className="space-y-4">
        <section className="panel rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar hue={user.avatarHue} name={user.displayName} size={56} />
              <div>
                <h2 className="display flex items-center gap-1.5 text-[20px]">
                  {user.displayName}
                  {user.isVerified && <VerifiedMark size={16} />}
                </h2>
                <p className="num text-[12px] text-ink-3">f/{user.username} · {user.role}</p>
              </div>
            </div>
            <EditProfileModal user={user} />
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-line pt-4 text-[13px]">
            <div>
              <p className="eyebrow text-ink-3">Headline</p>
              <p className="mt-1 text-ink">{user.headline || "No headline set."}</p>
            </div>
            <div>
              <p className="eyebrow text-ink-3">Karma</p>
              <p className="num mt-1 font-semibold text-ember">{user.karma.toLocaleString("en-US")} pts</p>
            </div>
            <div className="md:col-span-2">
              <p className="eyebrow text-ink-3">Bio</p>
              <p className="mt-1 text-ink-2 leading-relaxed">{user.bio || "No bio set."}</p>
            </div>
            <div className="md:col-span-2">
              <p className="eyebrow text-ink-3">Skills</p>
              {user.skills.length === 0 ? (
                <p className="mt-1 text-ink-3">No skills added yet.</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {user.skills.map((s) => (
                    <span key={s} className="tag">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="eyebrow text-ink-3">GitHub</p>
              <p className="mt-1 text-ink-2 truncate">{user.githubUrl || "Not linked"}</p>
            </div>
            <div>
              <p className="eyebrow text-ink-3">Portfolio</p>
              <p className="mt-1 text-ink-2 truncate">{user.portfolioUrl || "Not linked"}</p>
            </div>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
