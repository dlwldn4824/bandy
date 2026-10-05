import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import {
  ChatMessage,
  DrinkOrder,
  EventFeatures,
  EventItem,
  Guest,
  Note,
  Organizer,
  PlatformData,
  Session,
  digits,
  samePhone,
  seedPlatform,
} from './model'

const STORAGE_KEY = 'band-platform-demo-v1'

interface PlatformContextValue extends PlatformData {
  publicEvents: EventItem[]
  organizerById: (id: string) => Organizer | undefined
  eventById: (id: string) => EventItem | undefined
  guestsFor: (eventId: string) => Guest[]
  myGuests: Guest[]
  guestFor: (eventId: string) => Guest | undefined
  setGuestSession: (guest: Guest) => void
  loginHost: (name: string) => boolean
  registerHost: (input: { name: string; summary: string; city: string }) => boolean
  setStaffSession: (eventId: string, name: string) => void
  logout: () => void
  remember: (name: string, phone: string) => void
  addGuest: (guest: Omit<Guest, 'id' | 'entryNumber' | 'ticketReceived' | 'paymentConfirmed'> & {
    paymentConfirmed?: boolean
    enterSession?: boolean
  }) => Guest
  confirmGuest: (guestId: string, confirmed: boolean) => void
  receiveTicket: (guestId: string, received: boolean) => void
  addEvent: (event: EventItem) => void
  patchEvent: (eventId: string, patch: Partial<EventItem>) => void
  setFeature: (eventId: string, key: keyof EventFeatures, enabled: boolean) => void
  patchOrganizer: (organizerId: string, patch: Partial<Organizer>) => void
  addNote: (note: Omit<Note, 'id' | 'at'>) => void
  addMessage: (message: Omit<ChatMessage, 'id' | 'at'>) => void
  addOrder: (order: Omit<DrinkOrder, 'id' | 'at' | 'provided'>) => void
  provideOrder: (orderId: string) => void
}

const PlatformContext = createContext<PlatformContextValue | undefined>(undefined)

function loadData(): PlatformData {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PlatformData
  } catch {
    /* 저장된 데모가 깨졌으면 처음 데이터로 시작한다 */
  }
  return seedPlatform()
}

function nextEntry(guests: Guest[], eventId: string) {
  const numbers = guests
    .filter((guest) => guest.eventId === eventId && guest.entryNumber)
    .map((guest) => guest.entryNumber as number)
  return numbers.length ? Math.max(...numbers) + 1 : 1
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlatformData>(loadData)

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  const value = useMemo<PlatformContextValue>(() => {
    const organizerById = (id: string) => data.organizers.find((item) => item.id === id)
    const eventById = (id: string) => data.events.find((item) => item.id === id)
    const guestsFor = (eventId: string) => data.guests.filter((guest) => guest.eventId === eventId)
    const session = data.session
    const myGuests = session?.role === 'guest'
      ? data.guests.filter((guest) => samePhone(guest.phone, session.phone) && guest.name === session.name)
      : []

    return {
      ...data,
      publicEvents: data.events.filter((event) => event.status === '공개'),
      organizerById,
      eventById,
      guestsFor,
      myGuests,
      guestFor: (eventId: string) => myGuests.find((guest) => guest.eventId === eventId),
      setGuestSession: (guest) => setData((prev) => {
        const phone = digits(guest.phone)
        if (prev.session?.role === 'guest' && prev.session.name === guest.name && prev.session.phone === phone) {
          return prev
        }
        return {
          ...prev,
          session: { role: 'guest', name: guest.name, phone },
          lastName: guest.name,
          lastPhone: phone,
        }
      }),
      loginHost: (name) => {
        const organizer = data.organizers.find((item) => item.name.trim() === name.trim())
        if (!organizer) return false
        setData((prev) => ({
          ...prev,
          session: { role: 'host', organizerId: organizer.id, name: organizer.name },
        }))
        return true
      },
      registerHost: (input) => {
        const name = input.name.trim()
        if (!name || data.organizers.some((item) => item.name.trim() === name)) return false
        const organizer: Organizer = {
          id: `org-${Date.now()}`,
          name,
          summary: input.summary.trim(),
          city: input.city.trim() || '서울',
        }
        setData((prev) => ({
          ...prev,
          organizers: [...prev.organizers, organizer],
          session: { role: 'host', organizerId: organizer.id, name: organizer.name },
        }))
        return true
      },
      setStaffSession: (eventId, name) => setData((prev) => ({
        ...prev,
        session: { role: 'staff', eventId, name },
      })),
      logout: () => setData((prev) => ({ ...prev, session: null })),
      remember: (name, phone) => setData((prev) => ({ ...prev, lastName: name, lastPhone: digits(phone) })),
      addGuest: (input) => {
        const confirmed = input.paymentConfirmed === true
        const enterSession = input.enterSession !== false
        let created: Guest = {
          id: `guest-${Date.now()}`,
          eventId: input.eventId,
          name: input.name.trim(),
          phone: digits(input.phone),
          kind: input.kind,
          paymentConfirmed: confirmed,
          entryNumber: null,
          ticketReceived: false,
        }
        setData((prev) => {
          created = {
            ...created,
            entryNumber: confirmed ? nextEntry(prev.guests, input.eventId) : null,
          }
          return {
            ...prev,
            guests: [...prev.guests, created],
            lastName: created.name,
            lastPhone: created.phone,
            session: enterSession
              ? { role: 'guest', name: created.name, phone: created.phone }
              : prev.session,
          }
        })
        return created
      },
      confirmGuest: (guestId, confirmed) => setData((prev) => ({
        ...prev,
        guests: prev.guests.map((guest) => {
          if (guest.id !== guestId) return guest
          if (confirmed && !guest.entryNumber) {
            return { ...guest, paymentConfirmed: true, entryNumber: nextEntry(prev.guests, guest.eventId) }
          }
          if (!confirmed) return { ...guest, paymentConfirmed: false }
          return { ...guest, paymentConfirmed: true }
        }),
      })),
      receiveTicket: (guestId, received) => setData((prev) => ({
        ...prev,
        guests: prev.guests.map((guest) => guest.id === guestId ? { ...guest, ticketReceived: received } : guest),
      })),
      addEvent: (event) => setData((prev) => ({ ...prev, events: [event, ...prev.events] })),
      patchEvent: (eventId, patch) => setData((prev) => ({
        ...prev,
        events: prev.events.map((event) => event.id === eventId ? { ...event, ...patch } : event),
      })),
      setFeature: (eventId, key, enabled) => setData((prev) => ({
        ...prev,
        events: prev.events.map((event) => event.id === eventId
          ? { ...event, features: { ...event.features, [key]: enabled } }
          : event),
      })),
      patchOrganizer: (organizerId, patch) => setData((prev) => ({
        ...prev,
        organizers: prev.organizers.map((organizer) => organizer.id === organizerId ? { ...organizer, ...patch } : organizer),
        session: prev.session?.role === 'host' && prev.session.organizerId === organizerId
          ? { ...prev.session, name: patch.name ?? prev.session.name }
          : prev.session,
      })),
      addNote: (note) => setData((prev) => ({
        ...prev,
        notes: [...prev.notes, { ...note, id: `note-${Date.now()}`, at: Date.now() }],
      })),
      addMessage: (message) => setData((prev) => ({
        ...prev,
        messages: [...prev.messages, { ...message, id: `msg-${Date.now()}`, at: Date.now() }],
      })),
      addOrder: (order) => setData((prev) => ({
        ...prev,
        orders: [...prev.orders, { ...order, id: `order-${Date.now()}`, at: Date.now(), provided: false }],
      })),
      provideOrder: (orderId) => setData((prev) => ({
        ...prev,
        orders: prev.orders.map((order) => order.id === orderId ? { ...order, provided: true } : order),
      })),
    }
  }, [data])

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatform() {
  const value = useContext(PlatformContext)
  if (!value) throw new Error('PlatformProvider가 없습니다.')
  return value
}

export function findGuest(guests: Guest[], eventId: string, name: string, phone: string) {
  return guests.find((guest) => guest.eventId === eventId && guest.name.trim() === name.trim() && samePhone(guest.phone, phone))
}

export type { Session }
