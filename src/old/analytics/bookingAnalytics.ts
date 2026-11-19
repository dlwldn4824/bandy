import { trackEvent } from './trackEvent.ts'
import { getDaysBeforePerformance } from '../utils/bookingTime.ts'
import type { BookingSource } from '../utils/bookingTime.ts'
import { getUtmProperties } from './utm.ts'

export interface BookingSubmittedPayload {
  source: BookingSource
  is_walk_in: boolean
  booked_at: number
  days_before_performance: number | null
  performance_date?: string | null
}

export function trackBookingSubmitted(
  payload: BookingSubmittedPayload
): void {
  void trackEvent('booking_submitted', {
    source: payload.source,
    is_walk_in: payload.is_walk_in,
    booked_at: payload.booked_at,
    days_before_performance: payload.days_before_performance ?? undefined,
    performance_date: payload.performance_date ?? undefined,
    ...getUtmProperties(),
  })
}

export function buildBookingSubmittedPayload(
  source: BookingSource,
  isWalkIn: boolean,
  bookedAt: number,
  performanceDate?: string | null
): BookingSubmittedPayload {
  return {
    source,
    is_walk_in: isWalkIn,
    booked_at: bookedAt,
    days_before_performance: getDaysBeforePerformance(performanceDate, bookedAt),
    performance_date: performanceDate ?? null,
  }
}
