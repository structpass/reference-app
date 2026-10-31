export interface DashboardCountItemDto {
  featureId: string;
  count: number;
}

export interface DashboardCountsResponseDto {
  counts: DashboardCountItemDto[];
}
