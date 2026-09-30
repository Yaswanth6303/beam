import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  MonitorUp,
  MessagesSquare,
  ShieldCheck,
  Users,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"

const features = [
  {
    icon: Users,
    title: "Group meetings",
    description:
      "Host crystal-clear calls with your whole team, no downloads required.",
  },
  {
    icon: MonitorUp,
    title: "Screen sharing",
    description:
      "Present decks, demos, and docs with a single click during any call.",
  },
  {
    icon: MessagesSquare,
    title: "In-call chat",
    description:
      "Drop links and notes in a side panel that stays out of the way.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    description:
      "Only signed-in people with your meeting code can join, and media is encrypted in transit.",
  },
]

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Button render={<Link href="/signin" />} variant="ghost" size="lg">
              Sign in
            </Button>
            <Button render={<Link href="/signup" />} size="lg">
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-12 md:px-6 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                <Sparkles className="size-3.5" />
                Meetings that just work
              </span>
              <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
                Video calls for the way your team actually meets
              </h1>
              <p className="max-w-md text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                Beam brings HD video, screen sharing, and chat into one calm,
                fast, and secure place. Start a meeting in seconds.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button render={<Link href="/signup" />} size="lg">
                  Get started free
                  <ArrowRight />
                </Button>
                <Button
                  render={<Link href="/signin" />}
                  variant="outline"
                  size="lg"
                >
                  Sign in
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-2xl ring-1 ring-foreground/10 shadow-2xl shadow-primary/10">
                <Image
                  src="/images/hero-call.png"
                  alt="Beam video call with four participants"
                  width={900}
                  height={640}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
          <div className="mb-10 max-w-xl">
            <h2 className="text-balance text-3xl font-semibold tracking-tight">
              Everything you need in a call
            </h2>
            <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
              Thoughtful controls that stay out of your way, so you can focus on
              the conversation.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="font-medium">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 md:px-6">
          <div className="flex flex-col items-center gap-6 rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground">
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Ready to start your first meeting?
            </h2>
            <p className="max-w-md text-pretty leading-relaxed text-primary-foreground/80">
              Create a free account and invite anyone with a link.
            </p>
            <Button
              render={<Link href="/signup" />}
              size="lg"
              variant="secondary"
            >
              Create your account
              <ArrowRight />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} Beam. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
