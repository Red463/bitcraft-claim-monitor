import assert from "node:assert/strict";
import test from "node:test";

import {
  extractYouTubeChannelId,
  parseYouTubeFeed,
  resolveYouTubeChannelInput,
  youtubeVideosToNotify,
} from "../src/server/youtubeMonitor.mjs";

test("extractYouTubeChannelId accepts channel IDs, channel URLs, feed URLs, and handle pages", () => {
  assert.equal(extractYouTubeChannelId("UC1234567890123456789012"), "UC1234567890123456789012");
  assert.equal(extractYouTubeChannelId("https://www.youtube.com/channel/UCabcdefABCDEF123456789"), "UCabcdefABCDEF123456789");
  assert.equal(extractYouTubeChannelId("https://www.youtube.com/feeds/videos.xml?channel_id=UCfeedchannel1234567890"), "UCfeedchannel1234567890");
  assert.equal(extractYouTubeChannelId('<link rel="canonical" href="https://www.youtube.com/channel/UCcanonical123456789012">'), "UCcanonical123456789012");
});

test("resolveYouTubeChannelInput resolves direct ids without fetch and handles through page lookup", async () => {
  let fetchCalls = 0;
  const direct = await resolveYouTubeChannelInput("UCdirectchannel1234567890", async () => {
    fetchCalls += 1;
    throw new Error("should not fetch direct channel ids");
  });
  assert.equal(direct.channelId, "UCdirectchannel1234567890");
  assert.equal(fetchCalls, 0);

  const resolved = await resolveYouTubeChannelInput("https://www.youtube.com/@timbersteel", async (url) => {
    fetchCalls += 1;
    assert.equal(url, "https://www.youtube.com/@timbersteel");
    return { ok: true, text: async () => '<html><link rel="canonical" href="https://www.youtube.com/channel/UChandlechannel123456789"></html>' };
  });
  assert.equal(resolved.channelId, "UChandlechannel123456789");
  assert.equal(fetchCalls, 1);
});

test("parseYouTubeFeed extracts channel metadata and latest videos", () => {
  const feed = `<?xml version="1.0"?>
  <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
    <title>Timbersteel</title>
    <entry>
      <yt:videoId>video-new</yt:videoId>
      <yt:channelId>UCchannel</yt:channelId>
      <title>Newest &amp; Best</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=video-new"/>
      <published>2026-06-30T12:00:00+00:00</published>
      <media:thumbnail url="https://i.ytimg.com/vi/video-new/hqdefault.jpg" />
    </entry>
    <entry>
      <yt:videoId>video-old</yt:videoId>
      <title>Older</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=video-old"/>
      <published>2026-06-29T12:00:00+00:00</published>
    </entry>
  </feed>`;

  const parsed = parseYouTubeFeed(feed);
  assert.equal(parsed.channelTitle, "Timbersteel");
  assert.equal(parsed.videos.length, 2);
  assert.deepEqual(parsed.videos[0], {
    videoId: "video-new",
    title: "Newest & Best",
    url: "https://www.youtube.com/watch?v=video-new",
    publishedAt: "2026-06-30T12:00:00.000Z",
    thumbnailUrl: "https://i.ytimg.com/vi/video-new/hqdefault.jpg",
  });
});

test("youtubeVideosToNotify seeds first setup and caps unseen videos oldest first", () => {
  const videos = [
    { videoId: "newest", publishedAt: "2026-06-30T12:00:00.000Z" },
    { videoId: "middle", publishedAt: "2026-06-30T11:00:00.000Z" },
    { videoId: "oldest", publishedAt: "2026-06-30T10:00:00.000Z" },
  ];
  assert.deepEqual(youtubeVideosToNotify({ videos, seenVideoIds: new Set(), seedOnly: true }), []);
  assert.deepEqual(youtubeVideosToNotify({ videos, seenVideoIds: new Set(["oldest"]), limit: 1 }).map((video) => video.videoId), ["middle"]);
});
