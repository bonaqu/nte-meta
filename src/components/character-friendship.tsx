import { Star } from 'lucide-react';
import type { CharacterProfile } from '../types';
import { resolveItemIcon } from '../lib/item-icons';
export function CharacterFriendship({
  gifts,
  friendship,
}: Pick<CharacterProfile, 'gifts' | 'friendship'>) {
  return (
    <>
      {gifts.length ? (
        <h3 className="profile-subheading">Любимые подарки</h3>
      ) : null}
      {gifts.length ? (
        <div className="gift-grid">
          {gifts
            .filter(
              (gift, index, all) =>
                all.findIndex(
                  (row) => row.id.toLowerCase() === gift.id.toLowerCase(),
                ) === index,
            )
            .map((gift) => (
              <article key={gift.id}>
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
        <div className="friendship-track">
          {[...friendship]
            .sort((a, b) => a.level - b.level)
            .map((level) => {
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
                  <strong>{level.level}</strong>
                  <div className="friendship-level-content">
                    <h3>{`Уровень симпатии ${level.level}`}</h3>
                    <p>{level.description}</p>
                    {rewards.length ? (
                      <ul
                        className="friendship-reward-list"
                        aria-label={`Награды уровня ${level.level}`}
                      >
                        {rewards.map((reward) => (
                          <li key={reward.id}>
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
      ) : null}
    </>
  );
}
