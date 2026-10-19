import { useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isSm: width >= 640,
    isMd: width >= 768,
    isLg: width >= 1024,
    isXL: width >= 1280
  };
}

export const CONTAINER_MAX = 1280;
