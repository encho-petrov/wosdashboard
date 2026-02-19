import speedups from './speedups.png';
import chest from './chest.png';
import deployment_buff from './deployment_buff.png';
import enhancement from './enhancement.png';
import fcrystal from './fcrystal.png';
import health_buff from './health_buff.png';
import lethality_buff from './lethality_buff.png';
import pet from './pet.png';
import pet_stone from './pet_stone.png';
import shard from './shard.png';
import TBC1 from './TBC1.png';
import teleport from './teleport.png';

const RewardIcons = {
    'speedups.png': speedups,
    'chest.png': chest,
    'deployment_buff.png': deployment_buff,
    'enhancement.png': enhancement,
    'fcrystal.png': fcrystal,
    'health_buff.png': health_buff,
    'lethality_buff.png': lethality_buff,
    'pet.png': pet,
    'pet_stone.png': pet_stone,
    'shard.png': shard,
    'TBC1.png': TBC1,
    'teleport.png': teleport

};

export const getRewardIcon = (iconName) => {
    return RewardIcons[iconName] || null;
};