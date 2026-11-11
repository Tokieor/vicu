import { describe, it, expect } from 'vitest'
import { buildShortcutStatus } from '../shortcut-status'

describe('buildShortcutStatus', () => {
  it('does not flag waylandLimited when all enabled shortcuts register', () => {
    expect(
      buildShortcutStatus({
        entryEnabled: true,
        viewerEnabled: true,
        entryRegistered: true,
        viewerRegistered: true,
        isWaylandSession: true,
      })
    ).toEqual({ entry: true, viewer: true, wake: false, waylandLimited: false })
  })

  it('flags waylandLimited when an enabled shortcut fails on Wayland', () => {
    expect(
      buildShortcutStatus({
        entryEnabled: true,
        viewerEnabled: true,
        entryRegistered: false,
        viewerRegistered: true,
        isWaylandSession: true,
      })
    ).toEqual({ entry: false, viewer: true, wake: false, waylandLimited: true })
  })

  it('does not flag waylandLimited for failed registration outside Wayland', () => {
    expect(
      buildShortcutStatus({
        entryEnabled: true,
        viewerEnabled: false,
        entryRegistered: false,
        viewerRegistered: false,
        isWaylandSession: false,
      })
    ).toEqual({ entry: false, viewer: false, wake: false, waylandLimited: false })
  })

  it('treats disabled shortcuts as not registered and not failures', () => {
    expect(
      buildShortcutStatus({
        entryEnabled: false,
        viewerEnabled: false,
        entryRegistered: false,
        viewerRegistered: false,
        isWaylandSession: true,
      })
    ).toEqual({ entry: false, viewer: false, wake: false, waylandLimited: false })
  })

  it('flags waylandLimited for partial viewer failure only', () => {
    expect(
      buildShortcutStatus({
        entryEnabled: false,
        viewerEnabled: true,
        entryRegistered: false,
        viewerRegistered: false,
        isWaylandSession: true,
      })
    ).toEqual({ entry: false, viewer: false, wake: false, waylandLimited: true })
  })

  it('reports the wake shortcut even when Quick Entry and View are off', () => {
    expect(
      buildShortcutStatus({
        entryEnabled: false,
        viewerEnabled: false,
        entryRegistered: false,
        viewerRegistered: false,
        isWaylandSession: false,
        wakeEnabled: true,
        wakeRegistered: true,
      })
    ).toEqual({ entry: false, viewer: false, wake: true, waylandLimited: false })
  })

  it('treats a failed wake registration as a Wayland limitation too', () => {
    expect(
      buildShortcutStatus({
        entryEnabled: false,
        viewerEnabled: false,
        entryRegistered: false,
        viewerRegistered: false,
        isWaylandSession: true,
        wakeEnabled: true,
        wakeRegistered: false,
      })
    ).toEqual({ entry: false, viewer: false, wake: false, waylandLimited: true })
  })

  it('does not treat a cleared wake shortcut as a failure', () => {
    expect(
      buildShortcutStatus({
        entryEnabled: false,
        viewerEnabled: false,
        entryRegistered: false,
        viewerRegistered: false,
        isWaylandSession: true,
        wakeEnabled: false,
        wakeRegistered: false,
      })
    ).toEqual({ entry: false, viewer: false, wake: false, waylandLimited: false })
  })
})
