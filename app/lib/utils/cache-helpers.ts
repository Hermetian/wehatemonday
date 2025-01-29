import { revalidateTag } from 'next/cache';
import { CACHE_KEYS } from './cache';

export const invalidateTicketCache = () => {
  revalidateTag(CACHE_KEYS.TICKET_LIST);
};

export const invalidateTicketDetail = (ticket_id: string) => {
  revalidateTag(`${CACHE_KEYS.TICKET_DETAIL}:${ticket_id}`);
};

export const invalidateUserCache = () => {
  revalidateTag(CACHE_KEYS.USER_LIST);
};

export const invalidateTeamCache = () => {
  revalidateTag(CACHE_KEYS.TEAM_LIST);
}; 