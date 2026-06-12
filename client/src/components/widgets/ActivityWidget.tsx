import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Activity } from "../../lib/types";
import { Avatar } from "../ui";

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso + "Z").getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export default function ActivityWidget() {
  const [items, setItems] = useState<Activity[]>([]);

  useEffect(() => {
    api.get<Activity[]>("/activity").then(setItems);
  }, []);

  if (!items.length) return <p className="text-sm text-ink-soft">No activity yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {items.slice(0, 8).map((a) => (
        <li key={a.id} className="flex items-center gap-2 text-sm">
          <Avatar name={a.user_name} size={24} />
          <span className="truncate">
            <span className="font-medium">{a.user_name}</span>{" "}
            <span className="text-ink-soft">{a.action}</span>{" "}
            <span className="truncate">{a.detail}</span>
          </span>
          <span className="ml-auto shrink-0 text-xs text-ink-soft">{timeAgo(a.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
