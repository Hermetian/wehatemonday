import { revalidateTag } from 'next/cache';
import { CACHE_KEYS } from './cache';

export const invalidateTicketCache = () => {
  revalidateTag(CACHE_KEYS.TICKET_LIST);
};

export const invalidateTicketDetail = (ticketId: string) => {
  revalidateTag(`${CACHE_KEYS.TICKET_DETAIL}:${ticketId}`);
};

export const invalidateUserCache = () => {
  revalidateTag(CACHE_KEYS.USER_LIST);
};

export const invalidateTeamCache = () => {
  revalidateTag(CACHE_KEYS.TEAM_LIST);
}; 