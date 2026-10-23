// Allow importing PNG images as React Native asset numbers
declare module '*.png' {
  const value: number;
  export default value;
}
declare module '*.jpg' {
  const value: number;
  export default value;
}
declare module '*.svg' {
  const value: any;
  export default value;
}
