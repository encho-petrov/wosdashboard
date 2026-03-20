import speedups from './speedups.webp';
import chest from './chest.webp';
import deployment_buff from './deployment_buff.webp';
import enhancement from './enhancement.webp';
import fcrystal from './fcrystal.webp';
import health_buff from './health_buff.webp';
import lethality_buff from './lethality_buff.webp';
import pet from './pet.webp';
import pet_stone from './pet_stone.webp';
import shard from './shard.webp';
import TBC1 from './TBC1.webp';
import teleport from './teleport.webp';

const RewardIcons = {
    'speedups.webp': speedups,
    'chest.webp': chest,
    'deployment_buff.webp': deployment_buff,
    'enhancement.webp': enhancement,
    'fcrystal.webp': fcrystal,
    'health_buff.webp': health_buff,
    'lethality_buff.webp': lethality_buff,
    'pet.webp': pet,
    'pet_stone.webp': pet_stone,
    'shard.webp': shard,
    'TBC1.webp': TBC1,
    'teleport.webp': teleport

};

export const getRewardIcon = (iconName) => {
    return RewardIcons[iconName] || null;
};