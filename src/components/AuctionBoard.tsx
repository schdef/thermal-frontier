import {
  LandAuctionScreen,
  type LandAuctionScreenProps,
} from './LandAuctionScreen';

export type AuctionBoardProps = LandAuctionScreenProps;

export function AuctionBoard(props: AuctionBoardProps) {
  return <LandAuctionScreen {...props} headingMode="board" />;
}
