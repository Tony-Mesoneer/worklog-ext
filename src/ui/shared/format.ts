import { formatDuration, formatHhMm } from '@/core/duration'

export const hoursLabel = (seconds: number): string =>
  seconds === 0 ? '–' : formatDuration(seconds)

export const cellLabel = (seconds: number): string =>
  seconds === 0 ? '' : formatHhMm(seconds)
