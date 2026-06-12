interface AvatarProps {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}

const palette = ["bg-pen-blue", "bg-pen-red", "bg-pen-green", "bg-pen-amber"];

export function Avatar({ name, src, size = 32, className = "" }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const color = palette[name.length % palette.length];

  return src ? (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className={`rounded-full border-2 border-ink object-cover ${className}`}
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={`inline-flex items-center justify-center rounded-full border-2 border-ink font-bold text-paper ${color} ${className}`}
    >
      {initials}
    </span>
  );
}
