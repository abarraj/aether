import { InviteClient } from './invite-client';

type Props = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  return <InviteClient token={token} />;
}
