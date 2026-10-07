import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { api, cardParts, sendEnrollment } from './upload.js';
import { allowedMonths, monthLabel } from './months.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Aurora from '@/components/Aurora';
import GradientText from '@/components/GradientText';
import SpotlightCard from '@/components/SpotlightCard';
import ShinyText from '@/components/ShinyText';
import StarBorder from '@/components/StarBorder';
import PhotoDropzone from '@/components/PhotoDropzone';
import CardNotes from '@/components/CardNotes';
import logo from './assets/logo.png';
import './style.css';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const shiny = { color: '#93a1c4', shineColor: '#ffffff', disabled: reduceMotion };

function Field({ id, label, help, children }) {
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {help && <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p>}
  </div>;
}

function App() {
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [batch, setBatch] = useState('');
  const [center, setCenter] = useState('');
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
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadOptions(); }, []);
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
    if (!batch || !center) { setError('Please select your batch and physical center.'); return; }
    if (!photo) { setError('Please upload your monthly physical card photo.'); return; }
    const form = event.currentTarget;
    const fields = new FormData(form);
    const data = { batch, center, month, ...Object.fromEntries(['name', 'index'].map(key => [key, String(fields.get(key) || '').trim()])) };
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await sendEnrollment(data, photo, setProgress);
      setMessage(result.message || 'Your enrollment request was saved. Staff will review your card.');
      form.reset(); setPhoto(null); setBatch(''); setCenter(''); setMonth(currentMonth);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); setProgress(''); }
  }

  return <div className="relative min-h-svh overflow-hidden">
    {!reduceMotion && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[460px] opacity-60">
      <Aurora colorStops={['#0a4bff', '#38bdf8', '#1d4ed8']} amplitude={1} blend={0.6} />
    </div>}
    <main className="relative z-10 mx-auto max-w-xl px-4 py-10 sm:py-14">
      <header className="mb-8 text-center">
        <img src={logo} alt="PA class logo" width="112" height="112" className="mx-auto size-28" />
        <p className="mt-2 text-xs font-semibold tracking-[0.2em] text-primary">PHYSICAL CLASSES · LMS</p>
        <GradientText colors={['#38bdf8', '#1d8cff', '#a5d8ff']} animationSpeed={6} className="mt-3 cursor-default">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Monthly student enrollment</h1>
        </GradientText>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Choose your month and upload your physical class card. Staff will review your request and activate your LMS card.
        </p>
      </header>

      <SpotlightCard spotlightColor="rgba(29, 140, 255, 0.18)" className="!border-border !bg-popover/80 backdrop-blur">
        <div role="alert">{error && <Alert variant="destructive" className="mb-5"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}</div>
        <div role="status" aria-live="polite">{message && <Alert className="mb-5 border-primary/40 text-primary"><CheckCircle2 /><AlertDescription className="text-primary">{message}</AlertDescription></Alert>}</div>
        {loading && <p role="status" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /><ShinyText text="Loading batches and centers… this can take up to 30 seconds." {...shiny} /></p>}
        {!loading && !options && <Button type="button" variant="outline" className="mb-4 w-full" onClick={loadOptions}>Try loading again</Button>}

        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={loading || busy || !options} className="space-y-5 border-0 p-0">
            <legend className="mb-4 text-lg font-semibold">Student details</legend>
            <Field id="name" label="Student name">
              <Input id="name" name="name" autoComplete="name" maxLength={120} placeholder="Your full name" required />
            </Field>
            <Field id="index" label="Student index" help="Your 6-digit institute student index, for example 250002.">
              <Input id="index" name="index" inputMode="numeric" autoComplete="off" pattern="\d{6}" maxLength={6} placeholder="6-digit student index"
                title="Enter exactly 6 digits" required aria-describedby="index-help"
                onInput={event => { event.target.value = event.target.value.replace(/\D/g, ''); }} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="batch" label="Student batch">
                <Select value={batch} onValueChange={setBatch}>
                  <SelectTrigger id="batch" className="w-full"><SelectValue placeholder="Select your batch" /></SelectTrigger>
                  <SelectContent>{options?.batches.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field id="center" label="Physical center">
                <Select value={center} onValueChange={setCenter}>
                  <SelectTrigger id="center" className="w-full"><SelectValue placeholder="Select your center" /></SelectTrigger>
                  <SelectContent>{options?.centers.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
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
            <StarBorder type="submit" disabled={busy} color="#38bdf8" backgroundColor="#0a1a36" borderColor="#1d4f8f" speed="5s"
              className="w-full font-semibold disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Submitting…</span> : 'Submit enrollment request'}
            </StarBorder>
          </fieldset>
        </form>
        {busy && <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground"><ShinyText text={`${progress} Please keep this page open.`} {...shiny} /></p>}
        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          One request per student index and month. Submission records a request; staff confirm enrollment and activate the LMS card.
        </p>
      </SpotlightCard>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
