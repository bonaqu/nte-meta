import { useEffect, useRef, useState } from 'react';
import { emptySiteData, seedData } from '../data/seed';
import type { SiteData, User } from '../types';
import {
  hasApiBase,
  loadPublicCollection,
  loadSiteData,
  me,
  publicCollectionKeys,
  type PublicCollectionKey,
} from './api';
import { readPublicSnapshot, writePublicSnapshot } from './public-snapshot';

const isStaff = (user: User | null) =>
  Boolean(
    user && ['editor', 'moderator', 'admin', 'owner'].includes(user.role),
  );
function requiredCollections(route: string): PublicCollectionKey[] {
  const section = route.split('/')[0];
  if (section === 'characters') return ['characters'];
  if (section === 'tierlists') return ['characters', 'tierlists'];
  if (['guides', 'teams', 'rotations', 'videos'].includes(section))
    return ['characters', 'guides', 'teams', 'rotations'];
  if (section === 'threads') return ['threads'];
  if (section === 'news' && route.includes('/')) return ['news'];
  if (section === 'leaks' && route.includes('/')) return ['leaks'];
  if (['profile', 'admin'].includes(section)) return [];
  return ['characters', 'guides', 'news', 'leaks'];
}

export function useSiteBootstrap(route: string) {
  const remote = hasApiBase();
  const [data, setData] = useState<SiteData>(() =>
    remote ? emptySiteData : seedData,
  );
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState<Set<PublicCollectionKey>>(new Set());
  const [failures, setFailures] = useState<Set<PublicCollectionKey>>(new Set());
  const [authReady, setAuthReady] = useState(!remote);
  const [syncing, setSyncing] = useState(remote);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const epoch = useRef(0);
  const anonymousUi = useRef(true);
  const retry = () => setAttempt((value) => value + 1);

  useEffect(() => {
    if (!remote) return;
    let mounted = true;
    const generation = epoch.current;
    const fresh = new Set<PublicCollectionKey>();
    const current = () => mounted && epoch.current === generation;
    const apply = (
      key: PublicCollectionKey,
      value: SiteData[PublicCollectionKey],
    ) => {
      if (!current() || !anonymousUi.current) return;
      setData((previous) => ({ ...previous, [key]: value }));
      setReady((previous) => new Set(previous).add(key));
    };
    setSyncing(true);
    setError('');
    setFailures(new Set());
    void readPublicSnapshot().then((snapshot) => {
      for (const key of publicCollectionKeys) {
        const value = snapshot[key];
        if (value && !fresh.has(key)) apply(key, value);
      }
    });
    void Promise.allSettled(
      publicCollectionKeys.map(async (key) => {
        try {
          const value = await loadPublicCollection(key);
          fresh.add(key);
          apply(key, value);
          if (current()) void writePublicSnapshot(key, value);
        } catch {
          if (current()) setFailures((previous) => new Set(previous).add(key));
        }
      }),
    ).then(() => {
      if (current()) setSyncing(false);
    });

    // Authentication never holds public pages hostage. Editors receive the
    // complete credentialed dataset before editing controls become available.
    void me().then(async (result) => {
      if (!current()) return;
      const viewer = result.ok ? result.data : null;
      try {
        if (isStaff(viewer)) {
          const privateData = await loadSiteData({ includePrivate: true });
          if (!current()) return;
          anonymousUi.current = false;
          setData(privateData);
          setReady(new Set(publicCollectionKeys));
          setFailures(new Set());
        }
        if (current()) setUser(viewer);
      } catch {
        if (current())
          setError(
            'Не удалось загрузить редакционные данные. Повторите загрузку.',
          );
      } finally {
        if (current()) setAuthReady(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [attempt, remote]);

  async function updateViewer(next: User | null) {
    const generation = ++epoch.current;
    anonymousUi.current = false;
    setSyncing(false);
    if (!next) {
      // Clear private rows immediately, even if the public refresh is offline.
      setData(emptySiteData);
      setReady(new Set());
      setUser(null);
      setAuthReady(true);
      anonymousUi.current = true;
      retry();
      return;
    }
    try {
      const fresh = await loadSiteData({ includePrivate: isStaff(next) });
      if (epoch.current !== generation) return;
      setData(fresh);
      setReady(new Set(publicCollectionKeys));
      setFailures(new Set());
      setUser(next);
      setAuthReady(true);
      setError('');
    } catch {
      if (epoch.current !== generation) return;
      setError('Не удалось обновить данные после входа. Повторите загрузку.');
    }
  }
  const required = requiredCollections(route);
  const unavailable = required.some((key) => failures.has(key));
  const loading =
    remote &&
    ((['admin', 'profile'].includes(route.split('/')[0]) && !authReady) ||
      required.some((key) => !ready.has(key) && !failures.has(key)));
  return {
    data,
    setData,
    user,
    updateViewer,
    loading,
    retry,
    error:
      error ||
      (unavailable
        ? 'Не удалось обновить часть данных. Если доступна сохранённая версия, она остаётся на странице.'
        : ''),
    syncing,
  };
}
