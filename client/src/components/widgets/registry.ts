import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// Every widget is an independent, lazy-loaded component.
export interface WidgetDef {
  title: string;
  component: LazyExoticComponent<ComponentType>;
}

export const widgetRegistry: Record<string, WidgetDef> = {
  myTasks: {
    title: "My Tasks",
    component: lazy(() => import("./MyTasksWidget")),
  },
  stats: {
    title: "Project Stats",
    component: lazy(() => import("./StatsWidget")),
  },
  sprint: {
    title: "Sprint Progress",
    component: lazy(() => import("./SprintWidget")),
  },
  focus: {
    title: "Daily Focus",
    component: lazy(() => import("./DailyFocusWidget")),
  },
  capture: {
    title: "Quick Capture",
    component: lazy(() => import("./QuickCaptureWidget")),
  },
  calendar: {
    title: "Calendar",
    component: lazy(() => import("./CalendarWidget")),
  },
  milestones: {
    title: "Milestones",
    component: lazy(() => import("./MilestonesWidget")),
  },
  notes: {
    title: "Notes",
    component: lazy(() => import("./NotesWidget")),
  },
  pomodoro: {
    title: "Pomodoro",
    component: lazy(() => import("./PomodoroWidget")),
  },
  burndown: {
    title: "Burndown",
    component: lazy(() => import("./BurndownWidget")),
  },
  activity: {
    title: "Activity",
    component: lazy(() => import("./ActivityWidget")),
  },
  workload: {
    title: "Workload",
    component: lazy(() => import("./WorkloadWidget")),
  },
};

export const defaultLayout = [
  { id: "w-focus", type: "focus" },
  { id: "w-myTasks", type: "myTasks" },
  { id: "w-sprint", type: "sprint" },
  { id: "w-capture", type: "capture" },
  { id: "w-stats", type: "stats" },
  { id: "w-calendar", type: "calendar" },
];
