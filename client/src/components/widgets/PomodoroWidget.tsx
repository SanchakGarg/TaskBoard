import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "../ui";

const WORK_SECONDS = 25 * 60;

export default function PomodoroWidget() {
  const [left, setLeft] = useState(WORK_SECONDS);
  const [running, setRunning] = useState(false);
  const interval = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!running) return;
    interval.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval.current);
  }, [running]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const done = left === 0;

  return (
    <div className="text-center">
      <div
        className={`font-hand text-5xl font-bold tabular-nums ${done ? "anim-success text-pen-green" : running ? "text-pen-red" : ""}`}
      >
        {mm}:{ss}
      </div>
      {done && <p className="font-hand mt-1 text-pen-green">Break time! ☕</p>}
      <div className="mt-3 flex justify-center gap-2">
        <Button size="sm" variant={running ? "secondary" : "primary"} onClick={() => setRunning(!running)} disabled={done}>
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? "Pause" : "Start"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setRunning(false);
            setLeft(WORK_SECONDS);
          }}
        >
          <RotateCcw size={15} />
        </Button>
      </div>
    </div>
  );
}
