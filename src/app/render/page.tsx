import { redirect } from 'next/navigation';

// /render is retired as a free-render entry (ADR 0006). The homepage hero Mint
// widget is the single mint entry, so redirect there.
export default function RenderPage() {
  redirect('/');
}
