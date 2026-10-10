// What dealt a hit to an enemy: the player's attack, a parry's counter-damage, the blast
// of the player dying Exalted, or an aspect, named by its id. Carried by
// enemyDamaged/enemyKilled so an aspect never triggers off its own hits.
export const DamageCause = { Attack: 'attack', Parry: 'parry', Death: 'death' };
