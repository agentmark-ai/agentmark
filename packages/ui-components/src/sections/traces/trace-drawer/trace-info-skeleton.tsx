import { Box, Skeleton, Stack } from "@mui/material";

export const TraceInfoSkeleton = () => (
  <Stack
    height="100%"
    divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}
  >
    {/* Header Skeleton */}
    <Stack p={2} spacing={1}>
      <Skeleton variant="text" width={200} height={32} /> {/* Title */}
      <Skeleton variant="text" width={300} height={24} /> {/* Subtitle */}
      <Skeleton variant="text" width={150} height={20} /> {/* Model */}
    </Stack>

    {/* Content Skeleton */}
    <Box sx={{ flexGrow: 1, display: "flex", overflow: "hidden" }}>
      <Stack
        direction="row"
        divider={<Box sx={{ borderLeft: 1, borderColor: "divider" }} />}
        sx={{ width: "100%" }}
      >
        {/* Tree View Skeleton */}
        <Box width={500} minWidth={500} sx={{ overflowY: "auto" }} p={2}>
          <Stack spacing={1}>
            {[...Array(5)].map((_, index) => (
              <Stack key={index} spacing={0.5}>
                <Skeleton variant="text" width={200} height={24} />
                <Stack spacing={0.5} pl={3}>
                  {[...Array(2)].map((_, childIndex) => (
                    <Skeleton
                      key={childIndex}
                      variant="text"
                      width={180}
                      height={24}
                    />
                  ))}
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Box>

        {/* Details Panel Skeleton */}
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
          <Stack p={2} spacing={2}>
            {/* ID and Model */}
            <Stack direction="row" spacing={3}>
              <Skeleton variant="text" width={200} height={24} />
              <Skeleton variant="text" width={200} height={24} />
            </Stack>

            {/* Tabs */}
            <Skeleton variant="rectangular" width={200} height={32} />

            {/* Content */}
            <Stack spacing={2} pt={1}>
              {[...Array(3)].map((_, index) => (
                <Stack key={index} spacing={1}>
                  <Skeleton variant="rectangular" height={48} />
                  <Skeleton variant="rectangular" height={100} />
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Box>
      </Stack>
    </Box>
  </Stack>
);
