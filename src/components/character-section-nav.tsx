import { useEffect, useState } from 'react';

// Scrollspy state belongs to this small strip. Updating the selected tab must
// not render the entire character dossier (skills, markdown and media) again.
export function CharacterSectionNav({
  slug,
  hasWardrobe,
  onSelect,
  onLayout,
  onRelease,
}: {
  slug: string;
  hasWardrobe: boolean;
  onSelect: (id: string) => void;
  onLayout: () => void;
  onRelease: () => void;
}) {
  const [active, setActive] = useState('character-biography');
  const items = [
    ['character-biography', 'Биография'],
    ['character-abilities', 'Способности'],
    ['character-awakenings', 'Пробуждения'],
    ['character-progression', 'Прокачка'],
    ['character-friendship', 'Дружба'],
    ...(hasWardrobe ? [['character-wardrobe', 'Гардероб']] : []),
    ['character-voice', 'Озвучка'],
  ];
  useEffect(() => {
    const sections = [
      ...document.querySelectorAll<HTMLElement>(
        '.character-profile-page > section[id]',
      ),
    ];
    let frame = 0;
    const update = () => {
      frame = 0;
      const navigation = document.querySelector('.character-section-nav');
      const anchor = (navigation?.getBoundingClientRect().bottom || 120) + 100;
      const current = sections
        .filter((section) => section.getBoundingClientRect().top <= anchor)
        .at(-1);
      setActive(current?.id || 'character-biography');
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(() => {
      onLayout();
      schedule();
    });
    sections.forEach((section) => observer.observe(section));
    const root = document.querySelector('.character-profile-page');
    if (root) observer.observe(root);
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
      window.addEventListener(event, onRelease, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      onRelease();
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
        window.removeEventListener(event, onRelease);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [slug, hasWardrobe, onLayout, onRelease]);
  return (
    <nav className="character-section-nav" aria-label="Разделы персонажа">
      {items.map(([id, label]) => (
        <button
          type="button"
          key={id}
          className={active === id ? 'active' : ''}
          aria-current={active === id ? 'location' : undefined}
          onClick={() => {
            onSelect(id);
            setActive(id);
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
