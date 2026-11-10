# DeepPCB — Case Study

## Overview

DeepPCB is an EDA (electronic design automation) tool for PCB layout. I've been the product designer on it since 2023, owning UI, interaction design, motion, and — increasingly — the design system underneath it. Below is the arc of the product through one screen that changed the most, one feature that changed the product's shape, and the systems work that made both possible.

---

## 1. Board Viewer: Four Iterations, Three Years

The Board Viewer is the main workspace where engineers view and edit their PCB layout — it's the screen people spend the most time in, so it absorbed the most pressure as the product grew.

**The pattern:** each major revision wasn't a redesign for its own sake — it was a response to feature creep. As DeepPCB added capability (new panels, new tools, new AI features like Cooper), the viewer kept running out of room to hold it all without burying the actual board underneath UI chrome. Each iteration was really an exercise in re-earning screen real estate: deciding what deserved permanent visibility, what could collapse, and what needed to move out of the canvas entirely.

![Board viewer v0: a marketing navigation bar across the top with About, How it Works, FAQ and Contact; a dark product sidebar; a fixed Result panel listing connected pairs, vias and circuit length; and layer chips along the bottom. The board itself occupies less than half the frame.](deeppcb-board-viewer-v0.webp "v0 — the board competing with the website around it")

![Board viewer v1: the marketing bar is gone, a vertical toolbar of layer tools sits beside the canvas, the Result panel gains a solutions graph, and the board is framed in its own card.](deeppcb-board-viewer-v1.webp "v1 — the workspace separates from the site")

![Board viewer v2: the canvas runs edge to edge with no card around it, a narrow icon rail appears beside the right panel, and Display Settings becomes a per-layer list of eye toggles with a planes-opacity slider.](deeppcb-board-viewer-v2.webp "v2 — the canvas takes the whole frame")

![Board viewer v3: rulers along two edges, the right panel now a nested tree of layers, planes, geometry, keepouts and design elements, and a floating toolbar under the board carrying the solution stepper, timings and anomaly counts.](deeppcb-board-viewer-v3.webp "v3 — more control, and the right panel filling up")

By v3 the shape of the problem was clear. The right-hand panel had grown into a long scroll of visibility toggles, the left sidebar was still spending its full width on account navigation, and there was nowhere left to put a schematics viewer, a solutions history or an anomaly report.

### v3 to v4

The main focus is the board viewer. In this update I made it more compact to reserve space for future features, taking inspiration from existing bloated — yet well designed — apps like VS Code, and especially from how the team at Cursor are handling the same problem as they add their own features.

![The v4 Board Viewer: a single compact top bar, a left panel with Solutions, Graph and Anomalies, and a right panel with an Explorer tree of every board object.](deeppcb-board-viewer-v4.webp "v4 — the current workspace")

**The top bar absorbed the app sidebar.** Boards, credit and order history folded behind the logo, and the menus that were left came forward as labelled text rather than unlabelled icons.

![The v4 top bar, annotated: the DeepPCB logo carries a dropdown holding what used to be the main app sidebar, and Global Actions and Board Setup sit beside the board name as text menu items.](deeppcb-v4-top-bar.webp)

**A viewer switcher, added before the viewer it switches to.** SCH sits beside PCB in the header of a product that cannot yet open a schematic.

![A segmented control reading SCH and PCB above the canvas, annotated with the reasoning: a schematics viewer is coming, the pattern follows Altium and Flux so it feels familiar, and it leaves room for more viewers later, like 3D.](deeppcb-v4-viewer-switcher.webp)

**The right sidebar got a makeover.** It used to be visibility toggles and nothing else. The new Explorer is a searchable hierarchy of every object on the board — layers, planes, components, pads, tracks, keepouts, silkscreen, vias — with visibility demoted to a second tab rather than being the panel's whole reason for existing. This is a feature I fully envisioned and designed. We'll challenge it more to see whether there are edge cases I missed, but I'm optimistic: I haven't seen another app go as deep or as organised as this.

![Old sidebar and new sidebar side by side. The old one is titled Display Settings and holds a flat list of visibility toggles; the new one has Explorer and Visibility tabs, a search field, and an expandable tree running from layers down to individual pads.](deeppcb-v4-explorer.webp "Display Settings became an object explorer")

**The left panel is three collapsible sections, not one fixed layout.** Solutions, Graph and Anomalies each open and close independently, so someone debugging a single error can give it the whole panel and someone on a larger screen can keep all three. The app should feel like a true workspace, letting users tweak it to their needs — the new left sidebar is resizable and collapsible, à la VS Code.

![Four arrangements of the left panel: Solutions with Anomalies given the most space, Solutions with Graph and Anomalies collapsed to a summary, all three open at once, and Anomalies alone filling the panel for debugging.](deeppcb-v4-panel-states.webp "The same panel, arranged four ways")

**Why this belongs at the front of the case study:** most designers show a single polished screen. Showing the same screen across 3 years demonstrates something rarer — sustained judgment under changing constraints, not just one good decision.

---

## 2. Cooper: Introducing an AI Copilot Into an Existing Tool

Cooper is DeepPCB's AI copilot, layered into the existing editor rather than bolted on as a separate surface. Designing it meant solving problems most copilot UIs skip:

- **A mascot with states.** Cooper needed to feel present without being a chat window tax on screen space — idle, loading, and error states were each designed as distinct expressions of the same character, so its status reads at a glance rather than through text.
- **Discovery, not interruption.** Rather than a modal or tour, I designed a subtle nudge animation that activates only when the cursor approaches the Start Routing button — the moment a user is already about to do the task Cooper can help with. It surfaces the feature at the point of relevance instead of demanding attention up front.
- **Internal buy-in through motion, not a deck.** To introduce Cooper to the team, I made a short animated intro video rather than a slide presentation — a format choice that matched the product (an animated, personality-driven assistant) rather than describing it abstractly.

---

## 3. Net Types: Fixing Miscategorized Nets at Scale

Nets — the electrical connections on a board — get auto-categorized (analog, power, ground, high-speed, etc.), but engineers previously had no fast way to fix miscategorizations beyond correcting one net at a time.

I designed a panel that lets engineers multi-select nets across categories and drag them to the right one in bulk. Key decisions:

- **Cross-category multi-select**, since fixes usually needed several wrong nets moved into one right bucket in a single pass.
- **Drag-to-collapse categories** mid-drag, so every drop target stays visible instead of requiring scroll-and-search.
- **Snap over animated transitions** — I prototyped smooth column-resize animation, then removed it. Instant snap felt more responsive for an interaction repeated dozens of times per session.
- **Timed post-drop feedback** — a background flash confirms the move, delayed until any needed scroll finishes so it never fires off-screen.

This connects directly to **AI Suggestions for Net Classes**, a related screen where the system proposes categorizations up front and previews them alongside existing content — the Net Types panel is what a user falls back on when the AI's guess needs correcting.

---

## 4. Design System

Supporting visual: a consistent PCB object icon set (pads, traces, vias, components, keepouts, ratlines) drawn flat, in the same layer colors the editor already uses — so an icon and the thing it represents always match visually.

---

## 5. Beyond the Screen: Brand and Merch

Design work on DeepPCB extended past the interface:

- A **PCB-shaped Rubik's cube**, given away at events — reportedly hard enough to solve that only two people have managed it.
- A **sticker sheet** for conferences and events.
- The **Cooper mascot**, designed with enough variation (idle, loading, error) to work as both a product element and a brand character.
