import { Button } from "@/components/ui/button";

export default function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Brightloop One</h1>
      <p className="text-muted-foreground">Subscription billing, coming soon.</p>
      <Button>Get started</Button>
    </main>
  );
}
