import { useState } from 'react';
import { PageStepper } from './page-stepper';
import { Star } from 'lucide-react';
import type { CharacterProfile } from '../types';
import { resolveItemIcon } from '../lib/item-icons';
export function CharacterFriendship({
  gifts,
  friendship,
}: Pick<CharacterProfile, 'gifts' | 'friendship'>) {
  const levels = [...friendship].sort((a, b) => a.level - b.level);
  const [selectedLevel, setSelectedLevel] = useState(0);
  const activeIndex = Math.min(selectedLevel, Math.max(0, levels.length - 1));
  return (
    <>
      {gifts.length ? (
        <h3 className="profile-subheading">Любимые подарки</h3>
      ) : null}
      {gifts.length ? (
        <div className="gift-grid inventory-tiles">
          {gifts
            .filter(
              (gift, index, all) =>
                all.findIndex(
                  (row) => row.id.toLowerCase() === gift.id.toLowerCase(),
                ) === index,
            )
            .map((gift) => (
              <article className="game-item" key={gift.id}>
                {resolveItemIcon(gift.name, gift.iconUrl) ? (
                  <img
                    src={resolveItemIcon(gift.name, gift.iconUrl)}
                    alt=""
                    width="54"
                    height="54"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span
                    className="character-detail-fallback-icon"
                    aria-hidden="true"
                  >
                    <Star />
                  </span>
                )}
                <div className="character-detail-card-copy">
                  <h3>{gift.name}</h3>
                  <p>{gift.effect}</p>
                </div>
              </article>
            ))}
        </div>
      ) : null}
      {friendship.length ? (
        <h3 className="profile-subheading">Награды за уровни дружбы</h3>
      ) : null}
      {friendship.length ? (
        <div className="friendship-browser">
          <div
            className="friendship-levels"
            role="group"
            aria-label="Уровень дружбы"
          >
            {levels.map((level, index) => (
              <button
                type="button"
                key={level.level}
                aria-pressed={index === activeIndex}
                onClick={() => setSelectedLevel(index)}
              >
                <small>Ур.</small>
                {level.level}
              </button>
            ))}
          </div>
          <div className="friendship-track">
            {levels.slice(activeIndex, activeIndex + 1).map((level) => {
              const rewards = level.rewards?.length
                ? level.rewards
                : level.rewardName || level.rewardIconUrl
                  ? [
                      {
                        id: `legacy-reward-${level.level}`,
                        name: level.rewardName,
                        quantity: '',
                        iconUrl: level.rewardIconUrl,
                      },
                    ]
                  : [];
              return (
                <article key={level.level}>
                  <strong aria-hidden="true">{level.level}</strong>
                  <div className="friendship-level-content">
                    <h3>{`Уровень симпатии ${level.level}`}</h3>
                    {level.description ? <p>{level.description}</p> : null}
                    {rewards.length ? (
                      <ul
                        className="friendship-reward-list inventory-tiles"
                        aria-label={`Награды уровня ${level.level}`}
                      >
                        {rewards.map((reward) => (
                          <li className="game-item" key={reward.id}>
                            {resolveItemIcon(reward.name, reward.iconUrl) ? (
                              <img
                                src={resolveItemIcon(
                                  reward.name,
                                  reward.iconUrl,
                                )}
                                alt=""
                                width="44"
                                height="44"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                            <span>{reward.name || 'Награда'}</span>
                            {reward.quantity ? (
                              <strong>×{reward.quantity}</strong>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          <PageStepper
            label="Награды дружбы"
            unit="Уровень"
            value={activeIndex + 1}
            total={levels.length}
            onChange={(value) => setSelectedLevel(value - 1)}
          />
        </div>
      ) : null}
    </>
  );
}
