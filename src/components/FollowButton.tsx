"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck, UserPlus } from "lucide-react";
import { memo, useState } from "react";
import { useSession } from "@/components/providers";
import { api, ClientError, queryKeys } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

interface FollowButtonProps {
  username: string;
  initialFollowing?: boolean;
  initialFollowerCount?: number;
  showCount?: boolean;
  size?: "sm" | "md";
  className?: string;
}

interface FollowResponse {
  following: boolean;
  followerCount: number;
}

export const FollowButton = memo(function FollowButton({
  username,
  initialFollowing,
  initialFollowerCount,
  showCount = false,
  size = "sm",
  className,
}: FollowButtonProps) {
  const viewer = useSession();
  const notify = useUiStore((s) => s.notify);
  const qc = useQueryClient();
  const [hovering, setHovering] = useState(false);

  // If viewing self, don't show follow button
  if (viewer?.username === username) return null;

  const { data } = useQuery({
    queryKey: queryKeys.userFollow(username),
    queryFn: () => api<FollowResponse>(`/api/users/${encodeURIComponent(username)}/follow`),
    initialData:
      initialFollowing !== undefined
        ? {
            following: initialFollowing,
            followerCount: initialFollowerCount ?? 0,
          }
        : undefined,
    staleTime: 30_000,
  });

  const following = data?.following ?? false;
  const followerCount = data?.followerCount ?? 0;

  const mutation = useMutation({
    mutationFn: () =>
      api<FollowResponse>(`/api/users/${encodeURIComponent(username)}/follow`, {
        method: "POST",
      }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.userFollow(username) });
      const prev = qc.getQueryData<FollowResponse>(queryKeys.userFollow(username));

      const next: FollowResponse = {
        following: !following,
        followerCount: followerCount + (following ? -1 : 1),
      };

      qc.setQueryData(queryKeys.userFollow(username), next);
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.userFollow(username), ctx.prev);
      notify(err instanceof ClientError ? err.message : "Failed to update follow", "error");
    },
    onSuccess: (res) => {
      qc.setQueryData(queryKeys.userFollow(username), res);
      qc.invalidateQueries({ queryKey: queryKeys.user(username) });
    },
  });

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!viewer) return notify("Sign in to follow freelancers", "info");
    mutation.mutate();
  };

  const isSm = size === "sm";

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={mutation.isPending}
      className={cn(
        "btn inline-flex items-center gap-1.5 transition-colors font-medium",
        isSm ? "h-7 px-2.5 text-[12px]" : "h-8 px-3.5 text-[13px]",
        following
          ? hovering
            ? "border-danger/40 bg-danger/10 text-danger hover:border-danger hover:bg-danger/20"
            : "border-line bg-sunken text-ink-2 hover:border-line-strong"
          : "btn-primary",
        className,
      )}
    >
      {following ? (
        <>
          <UserCheck size={isSm ? 13 : 14} className="shrink-0" />
          <span>{hovering ? "Unfollow" : "Following"}</span>
        </>
      ) : (
        <>
          <UserPlus size={isSm ? 13 : 14} className="shrink-0" />
          <span>Follow</span>
        </>
      )}
      {showCount && <span className="num ml-0.5 text-ink-3">({followerCount})</span>}
    </button>
  );
});
