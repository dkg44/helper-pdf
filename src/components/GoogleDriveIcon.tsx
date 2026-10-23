import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface GoogleDriveIconProps {
  size?: number;
  style?: any;
}

export const GoogleDriveIcon: React.FC<GoogleDriveIconProps> = ({ size = 20, style }) => {
  const height = Math.round(size * 0.866);

  return (
    <Svg width={size} height={height} viewBox="0 0 87.3 75.6" style={style}>
      {/* Yellow Segment (Top Right) */}
      <Path
        d="M58.2 0H29.7L58.2 49.3H86.7L58.2 0Z"
        fill="#FFBA00"
      />
      {/* Blue Segment (Bottom) */}
      <Path
        d="M29.7 75.6H87.3L73 50.9H15.4L29.7 75.6Z"
        fill="#2684FF"
      />
      {/* Green Segment (Left) */}
      <Path
        d="M0 50.9L28.8 1L43.1 25.7L14.3 75.6L0 50.9Z"
        fill="#00AC47"
      />
    </Svg>
  );
};
