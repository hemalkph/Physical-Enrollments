import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { api, cardParts, sendEnrollment } from './upload.js';
import { normalizeWhatsapp } from './whatsapp.js';
import { allowedMonths, monthLabel } from './months.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SpotlightCard from '@/components/SpotlightCard';
import StarBorder from '@/components/StarBorder';
import PhotoDropzone from '@/components/PhotoDropzone';
import CardNotes from '@/components/CardNotes';
import logo from './assets/logo.png';
import './style.css';

// WebGL glow and smooth scrolling are skipped for reduced motion / Data Saver; the glow is also desktop-only.
const lite = matchMedia('(prefers-reduced-motion: reduce)').matches || !!navigator.connection?.saveData;
const fancyGlow = !lite && matchMedia('(min-width: 768px)').matches;
const Aurora = lazy(() => import('@/components/Aurora')); // ogl only downloads when used
// Smooth wheel scrolling; dropdown lists keep native scrolling.
if (!lite) new Lenis({ autoRaf: true, prevent: node => !!node.closest('[role="listbox"]') });

// Returning students re-enroll monthly: remember their details on this device.
const SAVED_KEY = 'enrollment-details';
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || {}; } catch { return {}; } };
const storeSaved = value => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(value)); } catch { /* private mode */ } };
const clearSaved = () => { try { localStorage.removeItem(SAVED_KEY); } catch { /* private mode */ } };

const Skeleton = () => <div className="h-11 w-full animate-pulse rounded-md bg-input/30 md:h-9" />;

function Field({ id, label, help, children }) {
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}<span aria-hidden className="text-destructive"> *</span></Label>
    {children}
    {help && <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p>}
  </div>;
}

function Glow() {
  // Fixed + faded top edge, so it never shows a seam when the page bounces.
  return <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[460px] opacity-60 [mask-image:linear-gradient(to_bottom,transparent,#000_35%)]">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_100%_at_50%_0%,rgba(29,78,216,0.55),transparent)]" />
    {fancyGlow && <Suspense fallback={null}><Aurora colorStops={['#0a4bff', '#38bdf8', '#1d4ed8']} amplitude={1} blend={0.6} /></Suspense>}
  </div>;
}

function App() {
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ text: '', value: 0 });
  const [saved, setSaved] = useState(loadSaved);
  const [formKey, setFormKey] = useState(0);
  const mainRef = useRef(null);
  const alertRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [batch, setBatch] = useState(saved.batch || '');
  const [center, setCenter] = useState(saved.center || '');
  const months = allowedMonths();
  const currentMonth = months[0];
  const [month, setMonth] = useState(currentMonth);

  async function loadOptions() {
    setLoading(true);
    setError('');
    try {
      // Apps Script can be slow or fail when idle, so retry once before showing an error.
      const result = await api().catch(() => api());
      if (!Array.isArray(result.batches) || !Array.isArray(result.centers) || !result.batches.length || !result.centers.length) {
        throw new Error('Staff need to add batches and physical centers before enrollment opens.');
      }
      setOptions(result);
      setBatch(value => result.batches.includes(value) ? value : '');
      setCenter(value => result.centers.includes(value) ? value : '');
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadOptions(); }, []);
  // A long form on a phone: bring the result into view.
  useEffect(() => {
    const behavior = lite ? 'auto' : 'smooth';
    if (error) alertRef.current?.scrollIntoView({ block: 'center', behavior });
    else if (message) mainRef.current?.scrollIntoView({ block: 'start', behavior });
  }, [error, message]);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function choosePhoto(file) {
    if (busy || !file) return;
    setError('');
    try { cardParts(file); setPhoto(file); }
    catch (failure) { setError(failure.message); setPhoto(null); }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const data = { batch, center, month, ...Object.fromEntries(['name', 'index', 'whatsapp'].map(key => [key, String(fields.get(key) || '').trim()])) };
    // Every field is required; name the first one that's missing.
    const problem = !data.name ? 'Enter your student name.'
      : !/^\d{6}$/.test(data.index) ? 'Enter your 6-digit student index.'
      : !normalizeWhatsapp(data.whatsapp) ? 'Enter a valid WhatsApp number, like 0771234567.'
      : !batch ? 'Select your batch.'
      : !center ? 'Select your physical center.'
      : !photo ? 'Upload your monthly physical card photo.' : '';
    if (problem) { setError(problem); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await sendEnrollment(data, photo, (text, value) => setProgress({ text, value }));
      const { month: _, ...details } = data;
      storeSaved(details); setSaved(details);
      setMessage(result.message || 'Your enrollment request was saved. Staff will review your card.');
      setPhoto(null); setMonth(currentMonth);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); setProgress({ text: '', value: 0 }); }
  }

  return <div className="relative min-h-svh overflow-hidden">
    <Glow />
    <main ref={mainRef} className="relative z-10 mx-auto max-w-xl scroll-mt-4 px-4 py-8 sm:py-14">
      <header className="mb-8 text-center">
        <img src={logo} alt="PA class logo" width="112" height="112" className="mx-auto size-28" />
        <p className="mt-2 text-xs font-semibold tracking-[0.2em] text-primary">PHYSICAL CLASSES · LMS</p>
        <h1 className="mt-3 bg-[linear-gradient(90deg,#38bdf8,#1d8cff,#a5d8ff,#38bdf8)] bg-[length:300%_100%] bg-clip-text text-3xl font-bold tracking-tight text-transparent motion-safe:animate-gradient sm:text-4xl">Monthly student enrollment</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Choose your month and upload your physical class card. Staff will review your request and activate your LMS card.
        </p>
      </header>

      <SpotlightCard spotlightColor="rgba(29, 140, 255, 0.18)" className="!border-border !bg-popover/80 !p-5 backdrop-blur sm:!p-8">
        <div role="alert" ref={alertRef} className="scroll-mt-4">{error && <Alert variant="destructive" className="mb-5"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}</div>
        {loading && <p role="status" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading batches and centers… this can take up to 30 seconds.</p>}
        {!loading && !options && <Button type="button" variant="outline" className="mb-4 w-full" onClick={loadOptions}>Try loading again</Button>}

        {message ? <div role="status" aria-live="polite" className="space-y-4 py-4 text-center">
          <CheckCircle2 className="mx-auto size-14 text-primary" />
          <h2 className="text-xl font-semibold">Request received</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setMessage('')}>Enroll another month or student</Button>
        </div> : <form key={formKey} onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={loading || busy || !options} className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-lg font-semibold">Student details</legend>
            <p className="-mt-2 text-xs text-muted-foreground"><span aria-hidden className="text-destructive">*</span> All fields are required.</p>
            <Field id="name" label="Student name">
              <Input id="name" name="name" autoComplete="name" enterKeyHint="next" maxLength={120} placeholder="Your full name" defaultValue={saved.name} required />
            </Field>
            <Field id="index" label="Student index" help="Your 6-digit institute student index, for example 250002.">
              <Input id="index" name="index" inputMode="numeric" autoComplete="off" enterKeyHint="next" pattern="\d{6}" maxLength={6} placeholder="6-digit student index"
                title="Enter exactly 6 digits" required aria-describedby="index-help" defaultValue={saved.index}
                onInput={event => { event.target.value = event.target.value.replace(/\D/g, ''); }} />
            </Field>
            <Field id="whatsapp" label="WhatsApp number" help="Sri Lankan mobile number, for example 0771234567. Staff may contact you here.">
              <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="done" maxLength={16} placeholder="07X XXX XXXX"
                aria-describedby="whatsapp-help" defaultValue={saved.whatsapp} required />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="batch" label="Student batch">
                {loading ? <Skeleton /> : <Select value={batch} onValueChange={setBatch}>
                  <SelectTrigger id="batch" className="w-full"><SelectValue placeholder="Select your batch" /></SelectTrigger>
                  <SelectContent>{options?.batches.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>}
              </Field>
              <Field id="center" label="Physical center">
                {loading ? <Skeleton /> : <Select value={center} onValueChange={setCenter}>
                  <SelectTrigger id="center" className="w-full"><SelectValue placeholder="Select your center" /></SelectTrigger>
                  <SelectContent>{options?.centers.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>}
              </Field>
            </div>
            <Field id="month" label="Enrollment month" help="Choose this month or one of the last 2 months.">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="month" className="w-full" aria-describedby="month-help"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((value, i) => <SelectItem key={value} value={value}>{monthLabel(value)}{i === 0 && ' (this month)'}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field id="image" label="Monthly physical card photo" help="Upload a clear JPG, PNG or WebP image, up to 5 MB.">
              <CardNotes />
              <PhotoDropzone photo={photo} preview={preview} onFile={choosePhoto} onClear={() => setPhoto(null)} />
            </Field>
            {/* Sticks to the bottom of the screen on phones so Submit is always reachable. */}
            <div className="max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:-mx-5 max-sm:bg-gradient-to-t max-sm:from-popover max-sm:via-popover/95 max-sm:to-transparent max-sm:px-5 max-sm:pt-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
              {busy && <div role="status" aria-live="polite" className="mb-3 space-y-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-input/40"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress.value * 100}%` }} /></div>
                <p className="text-sm text-muted-foreground">{progress.text} Please keep this page open.</p>
              </div>}
              <StarBorder type="submit" disabled={busy} color="#38bdf8" backgroundColor="#0a1a36" borderColor="#1d4f8f" speed="5s"
                className="w-full font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Submitting…</span> : 'Submit enrollment request'}
              </StarBorder>
            </div>
          </fieldset>
        </form>}
        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          One request per student index and month. Submission records a request; staff confirm enrollment and activate the LMS card.
          {saved.index && <> Your details are saved on this device for next month. <button type="button" className="underline underline-offset-2"
            onClick={() => { clearSaved(); setSaved({}); setBatch(''); setCenter(''); setFormKey(key => key + 1); }}>Clear saved details</button></>}
        </p>
      </SpotlightCard>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
