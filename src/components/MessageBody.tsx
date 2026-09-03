import { linkify, mediaOf, type Mentions } from "../lib/linkify";
import MediaEmbeds from "./MediaEmbeds";

// One message body, rendered the way a chat client renders one: the text with
// every URL clickable, and any image or video someone shared shown underneath
// rather than left as a string of characters to copy into a new tab.
export default function MessageBody({ content, id, mentions, className = "" }: {
  content: string;
  id: string;
  mentions?: Mentions;
  className?: string;
}) {
  const { media, only } = mediaOf(content);
  return (
    <>
      {only ? null : (
        <p className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed ${className}`}>
          {linkify(content, id, mentions)}
        </p>
      )}
      <MediaEmbeds media={media} />
    </>
  );
}
