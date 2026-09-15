import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, ExternalLink, MessageCircle, Send, Sparkles, UserRound, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { aiMentorChat } from "@/lib/sarvam.functions";
import { logActivity } from "@/lib/loop-store";

export const Route = createFileRoute("/mentor")({
  head: () => ({ meta: [{ title: "Chatbot & Mentor — BuildMyLogic" }] }),
  component: Mentor,
});

type MentorMode = "chat" | "zoom";
type Mentor = { id: string; name: string; role: string; focus: string; description: string; initials: string; color: string };
type ChatMessage = { role: "mentor" | "student"; text: string; at: number };
type Booking = { id: string; mentorId: string; date: string; time: string; duration: number; topic: string; zoomLink: string; createdAt: number };

const MENTORS: Mentor[] = [
  { id: "vibe", name: "Vibe", role: "AI build coach", focus: "Coding help, debugging, and simple explanations", description: "Always here. Speaks simple English and understands Manglish.", initials: "V", color: "bg-black text-white" },
  { id: "maya", name: "Maya", role: "Frontend mentor", focus: "React, UI, CSS, and user experience", description: "Helps you make pages clear, useful, and beautiful.", initials: "M", color: "bg-primary text-white" },
  { id: "arun", name: "Arun", role: "Backend mentor", focus: "APIs, databases, and server logic", description: "Breaks big backend problems into small steps.", initials: "A", color: "bg-emerald-700 text-white" },
  { id: "nila", name: "Nila", role: "Career mentor", focus: "Projects, confidence, and your next step", description: "Helps you turn your learning into real progress.", initials: "N", color: "bg-amber-500 text-white" },
];

const CHAT_STORAGE = "bml-mentor-chat-v1";
const BOOKING_STORAGE = "bml-mentor-bookings-v1";

function localDate(days = 1) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function starterMessage(mentor: Mentor): ChatMessage {
  return { role: "mentor", text: `Hi! I am ${mentor.name}. ${mentor.description} What are you building today?`, at: Date.now() };
}

function fallbackReply(mentor: Mentor, message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("manasilayilla") || lower.includes("ariyilla") || lower.includes("don't know")) {
    return "That's okay 😊 We can start very small. Tell me the one part that feels confusing. Nammal step by step pokam.";
  }
  if (lower.includes("stuck") || lower.includes("error") || lower.includes("bug")) {
    return `${mentor.name} here. First, show me the exact error. Then we will find the smallest cause. Don't change many things at once.`;
  }
  return `Good question. ${mentor.name} can help. Tell me your goal, what you tried, and what happened. We will take one small step next.`;
}

function calendarUrl(booking: Booking, mentor: Mentor) {
  const start = new Date(`${booking.date}T${booking.time}:00`);
  const end = new Date(start.getTime() + booking.duration * 60_000);
  const format = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `BuildMyLogic mentor session with ${mentor.name}`,
    dates: `${format(start)}/${format(end)}`,
    details: `${booking.topic || "Mentor help session"}\n\nZoom link: ${booking.zoomLink || "Add the Zoom link after creating the meeting."}\n\nBuildMyLogic Chatbot & Mentor`,
    location: booking.zoomLink || "Zoom — link will be added by the mentor",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function Mentor() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<MentorMode | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [date, setDate] = useState(localDate());
  const [time, setTime] = useState("19:00");
  const [duration, setDuration] = useState(30);
  const [topic, setTopic] = useState("");
  const [zoomLink, setZoomLink] = useState("");
  const [scheduled, setScheduled] = useState(false);

  const mentor = useMemo(() => MENTORS.find((item) => item.id === selectedId) ?? null, [selectedId]);
  const mentorBookings = bookings.filter((booking) => booking.mentorId === selectedId);

  useEffect(() => {
    try {
      const savedMentor = window.localStorage.getItem("bml-selected-mentor");
      if (savedMentor && MENTORS.some((item) => item.id === savedMentor)) setSelectedId(savedMentor);
      const savedBookings = window.localStorage.getItem(BOOKING_STORAGE);
      if (savedBookings) setBookings(JSON.parse(savedBookings) as Booking[]);
    } catch {
      // Local storage is optional. The page still works without it.
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    window.localStorage.setItem("bml-selected-mentor", selectedId);
    try {
      const saved = JSON.parse(window.localStorage.getItem(CHAT_STORAGE) || "{}") as Record<string, ChatMessage[]>;
      setMessages(saved[selectedId]?.length ? saved[selectedId] : [starterMessage(MENTORS.find((item) => item.id === selectedId)!)]) ;
    } catch {
      setMessages([starterMessage(MENTORS.find((item) => item.id === selectedId)!)]);
    }
    setMode(null);
    setChatError("");
    setScheduled(false);
  }, [selectedId]);

  function saveMessages(next: ChatMessage[]) {
    setMessages(next);
    try {
      const saved = JSON.parse(window.localStorage.getItem(CHAT_STORAGE) || "{}") as Record<string, ChatMessage[]>;
      if (selectedId) window.localStorage.setItem(CHAT_STORAGE, JSON.stringify({ ...saved, [selectedId]: next.slice(-60) }));
    } catch {
      // Keep the live chat working if storage is unavailable.
    }
  }

  async function sendMessage() {
    const outgoing = message.trim();
    if (!outgoing || !mentor || busy) return;
    const next = [...messages, { role: "student" as const, text: outgoing, at: Date.now() }];
    saveMessages(next);
    setMessage("");
    setBusy(true);
    setChatError("");
    try {
      const result = await aiMentorChat({ data: { mentorName: mentor.name, mentorSpecialty: mentor.focus, learnerMessage: outgoing, history: next.slice(-10).map((item) => ({ role: item.role === "student" ? "student" as const : "mentor" as const, text: item.text })) } });
      saveMessages([...next, { role: "mentor", text: result.message, at: Date.now() }]);
    } catch {
      saveMessages([...next, { role: "mentor", text: fallbackReply(mentor, outgoing), at: Date.now() }]);
      setChatError("Vibe is offline right now, so I gave you a simple starting reply.");
    } finally {
      setBusy(false);
    }
  }

  function scheduleZoom() {
    if (!mentor || !date || !time) return;
    const booking: Booking = { id: crypto.randomUUID?.() ?? `booking-${Date.now()}`, mentorId: mentor.id, date, time, duration, topic: topic.trim() || "Help with my BuildMyLogic project", zoomLink: zoomLink.trim(), createdAt: Date.now() };
    const next = [booking, ...bookings];
    setBookings(next);
    window.localStorage.setItem(BOOKING_STORAGE, JSON.stringify(next));
    setScheduled(true);
    logActivity({ kind: "ai", text: `Requested a ${duration}-minute Zoom mentor session with ${mentor.name}.` });
  }

  if (!mentor) {
    return (
      <AppShell crumb="Chatbot" title="Choose your mentor" subtitle="Pick a mentor first. Then chat for help or book a Zoom session." quote="You do not have to build alone." wide>
        <section className="card-surface border-2 border-primary/20 bg-primary-soft/30 p-5">
          <div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-white"><MessageCircle className="h-5 w-5" /></span><div><p className="text-[11px] font-black uppercase tracking-wider text-primary">BuildMyLogic Chatbot</p><h2 className="mt-1 text-xl font-black">Who do you want to talk to?</h2><p className="mt-1 text-sm font-semibold">Choose one mentor. You can change later.</p></div></div>
        </section>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {MENTORS.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="card-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"><div className="flex items-start gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black ${item.color}`}>{item.initials}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-black">{item.name}</h2><p className="text-xs font-bold text-primary">{item.role}</p></div><span className="rounded-full bg-black/[0.05] px-2 py-1 text-[10px] font-black">Choose →</span></div><p className="mt-3 text-sm font-black">{item.focus}</p><p className="mt-1 text-xs font-semibold text-black/60">{item.description}</p></div></div></button>)}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={`Chatbot › ${mentor.name}`} title={`${mentor.name} is here to help`} subtitle="Choose Chat for quick help, or Zoom for a planned mentor session." wide>
      <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => { setSelectedId(null); setMode(null); }} className="btn-base btn-outline"><ArrowLeft className="h-4 w-4" />Choose another mentor</button><div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-2"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${mentor.color}`}>{mentor.initials}</span><span><b className="block text-xs">{mentor.name}</b><small className="block text-[10px] font-semibold">{mentor.role}</small></span></div></div>
      {!mode && <section className="mt-5 card-surface p-6"><div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><UserRound className="h-7 w-7" /></span><h2 className="display mt-4 text-2xl font-black">How would you like help?</h2><p className="mx-auto mt-2 max-w-xl text-sm font-semibold">Start a chat now, or set a time for a Zoom session with {mentor.name}.</p></div><div className="mx-auto mt-6 grid max-w-3xl gap-4 md:grid-cols-2"><button type="button" onClick={() => setMode("chat")} className="rounded-2xl border-2 border-black/10 bg-white p-5 text-left transition hover:border-primary hover:bg-primary-soft/30"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-white"><MessageCircle className="h-5 w-5" /></span><h3 className="mt-4 text-lg font-black">Chat with {mentor.name}</h3><p className="mt-1 text-sm font-semibold">Ask questions and get simple help here.</p><span className="mt-4 inline-flex text-xs font-black text-primary">Open chat →</span></button><button type="button" onClick={() => setMode("zoom")} className="rounded-2xl border-2 border-black/10 bg-white p-5 text-left transition hover:border-primary hover:bg-primary-soft/30"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white"><Video className="h-5 w-5" /></span><h3 className="mt-4 text-lg font-black">Book a Zoom session</h3><p className="mt-1 text-sm font-semibold">Pick a day and time for a deeper talk.</p><span className="mt-4 inline-flex text-xs font-black text-primary">Schedule Zoom →</span></button></div></section>}

      {mode === "chat" && <section className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-black/10 bg-black px-5 py-4 text-white"><span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${mentor.color}`}>{mentor.initials}</span><div><p className="text-sm font-black">{mentor.name}</p><p className="text-[11px] font-semibold text-white/65">Online · {mentor.focus}</p></div><button type="button" onClick={() => setMode(null)} className="ml-auto rounded-lg px-3 py-2 text-xs font-black text-white/70 hover:bg-white/10">Back</button></div><div className="min-h-[390px] space-y-3 bg-[#f5f3f7] p-4 sm:p-6">{messages.map((item, index) => <div key={`${item.at}-${index}`} className={`flex ${item.role === "student" ? "justify-end" : "justify-start"}`}><div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm font-semibold leading-6 shadow-sm ${item.role === "student" ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-white text-black"}`}><p className="whitespace-pre-wrap">{item.text}</p><p className={`mt-1 text-[9px] font-bold ${item.role === "student" ? "text-white/60" : "text-black/40"}`}>{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>)}{busy && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-xs font-bold text-black/50">{mentor.name} is typing…</div></div>}</div>{chatError && <p className="border-t border-black/10 bg-amber-50 px-5 py-2 text-xs font-bold text-amber-800">{chatError}</p>}<form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="flex items-end gap-2 border-t border-black/10 bg-white p-3"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={1} placeholder="Write a message… Manglish is okay" className="min-h-11 flex-1 resize-none rounded-xl border border-black/10 bg-black/[0.03] px-3 py-3 text-sm font-semibold outline-none focus:border-primary" /><button type="submit" disabled={busy || !message.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send className="h-4 w-4" /></button></form></section>}

      {mode === "zoom" && <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="card-surface p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white"><Video className="h-5 w-5" /></span><div><h2 className="text-lg font-black">Schedule a Zoom session</h2><p className="mt-1 text-sm font-semibold">Choose a time. Then create or paste the Zoom link.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-black">Day<input type="date" min={localDate(0)} value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-primary" /></label><label className="text-xs font-black">Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-primary" /></label><label className="text-xs font-black">Length<select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-primary"><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option></select></label><label className="text-xs font-black">Zoom link (optional)<input value={zoomLink} onChange={(event) => setZoomLink(event.target.value)} placeholder="https://zoom.us/j/..." className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-primary" /></label></div><label className="mt-4 block text-xs font-black">What do you want help with?<textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} placeholder="Example: I want help with my React project." className="mt-2 w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-primary" /></label><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={scheduleZoom} className="btn-base btn-primary-solid"><CalendarClock className="h-4 w-4" />{scheduled ? "Zoom session saved" : "Save Zoom session"}</button><a href="https://zoom.us/meeting/schedule" target="_blank" rel="noreferrer" className="btn-base btn-outline"><ExternalLink className="h-4 w-4" />Open Zoom scheduler</a></div>{scheduled && <p className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Saved on this device. Add the Zoom link when your meeting is created.</p>}</div><aside className="space-y-5"><section className="card-surface p-5"><h3 className="text-sm font-black">Your upcoming sessions</h3>{mentorBookings.length === 0 ? <p className="mt-3 text-sm font-semibold text-black/55">No Zoom session yet.</p> : <div className="mt-3 space-y-3">{mentorBookings.slice(0, 4).map((booking) => <div key={booking.id} className="rounded-xl border border-primary/20 bg-primary-soft/40 p-3"><p className="text-xs font-black">{new Date(`${booking.date}T${booking.time}:00`).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><p className="mt-1 text-[11px] font-bold">{booking.duration} minutes · {booking.topic}</p>{booking.zoomLink ? <a href={booking.zoomLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-primary">Join Zoom <ExternalLink className="h-3 w-3" /></a> : <p className="mt-2 text-[10px] font-bold text-black/50">Zoom link not added yet.</p>}<a href={calendarUrl(booking, mentor)} target="_blank" rel="noreferrer" className="mt-2 block text-[10px] font-black text-black underline">Add to Google Calendar</a></div>)}</div>}</section><section className="card-surface bg-black p-5 text-white"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h3 className="text-sm font-black">Before the call</h3></div><ul className="mt-3 space-y-2 text-xs font-semibold text-white/75"><li>• Write your one main question.</li><li>• Keep your project open.</li><li>• Test your microphone.</li></ul></section></aside></section>}
    </AppShell>
  );
}
