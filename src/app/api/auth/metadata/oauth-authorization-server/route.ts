import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "~/auth";

export const GET = oauthProviderAuthServerMetadata(auth);
