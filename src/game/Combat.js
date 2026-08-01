/**
 * Combat.js — 데미지 공식(CLAUDE.md §5-1, 순서 고정) · 상태이상 적용
 *
 * Projectile.js의 onHit({ hits })을 받아 각 적에 데미지를 먹이는 진입점만 노출한다.
 * enemyKilled·보상·XP 발행은 여기서 하지 않는다 — Enemy.onDeath → EnemyPool의
 * onEnemyDeath 콜백(WaveManager가 등록) 몫으로 남겨둔다.
 *
 * §5-1 의사코드는 tower.strongAgainst?.[enemy.id]라고 적혀 있지만, enemies.json의
 * strongAgainst 키는 종(species) id다("dust","trash"). Enemy.js에서 이 값은
 * enemy.type에 들어있고(enemy.id는 스폰마다 고유한 인스턴스 id), 그래서 실제 구현은
 * def.strongAgainst?.[enemy.type]로 상성을 찾는다.
 *
 * PolicySystem은 perks와 달리 직접 import한다 — perks는 "당시 PerkSystem이 없어서"
 * 파라미터로 주입한 임시 조치였지만, PolicySystem은 이미 확정된 모듈이라 Tower.js가
 * GridSystem을 직접 import하는 것과 같은 방식으로 둔다(살수차: 청계천 슬로우 +50%).
 */

import { EventBus, EV } from '../EventBus.js';
import PolicySystem from './PolicySystem.js';

/** perks가 없거나 일부만 와도(PerkSystem 붙기 전) 안전하게 0으로 채운다. */
function normalizePerks(perks) {
  return {
    globalDamage: perks?.globalDamage ?? 0,
    globalCrit: perks?.globalCrit ?? 0,
    globalPierce: perks?.globalPierce ?? 0,
  };
}

function applyHit(tower, enemy, perks) {
  if (!enemy.alive) return; // 같은 프레임 다른 히트로 이미 죽은 대상 방어

  const def = tower.def;
  const lv = tower.level;

  // 1) 기본 피해 (강화 레벨 반영)
  let dmg = def.damage * def.levels[lv].statMul;

  // 2) 상성 특효
  const eff = def.strongAgainst?.[enemy.type] ?? 1.0;
  dmg *= eff;
  const isEffective = eff > 1.0;

  // 3) 전역 공격력 퍼크 (누적)
  dmg *= 1 + perks.globalDamage;

  // 4) 크리티컬 판정 (확률 100% 상한)
  const critChance = Math.min(1.0, perks.globalCrit);
  const isCrit = Math.random() < critChance;
  if (isCrit) dmg *= 2;

  // 5) 방어력 차감 (관통 퍼크로 무시)
  const armor = Math.max(0, enemy.armor - perks.globalPierce);

  // 6) 최종 (최소 피해 1)
  const finalDamage = Math.max(1, Math.round(dmg) - armor);

  enemy.takeDamage(finalDamage);

  EventBus.emit(EV.enemyDamaged, {
    id: enemy.id,
    amount: finalDamage,
    x: enemy.x,
    y: enemy.y,
    isEffective,
    isCrit,
  });

  // 킬샷이면 죽은 대상에 상태이상을 걸 필요가 없다
  if (enemy.alive) {
    def.effects?.forEach(effect => {
      const scaled = effect.type === 'slow'
        ? { ...effect, amount: effect.amount * PolicySystem.getMul('slowEffectMul', tower.id) }
        : effect;
      enemy.applyEffect(scaled);
      EventBus.emit(EV.statusApplied, {
        enemyId: enemy.id,
        type: scaled.type,
        duration: scaled.duration,
      });
    });
  }
}

/** Projectile.js의 onHit({ hits })을 그대로 넘기면 된다. hits는 0개 이상. */
export function applyHits(tower, hits, perks) {
  const p = normalizePerks(perks);
  hits.forEach(enemy => applyHit(tower, enemy, p));
}

export default applyHits;
