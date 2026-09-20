import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "~/auth";

export const GET = oauthProviderOpenIdConfigMetadata(auth);
