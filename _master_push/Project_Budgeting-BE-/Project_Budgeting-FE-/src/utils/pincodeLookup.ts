/**
 * Looks up city/state for an Indian PIN code via the public India Post API.
 * Used to auto-fill the City/State fields once a 6-digit pincode is entered,
 * so users don't have to type them manually.
 */
export interface PincodeDetails {
  city: string;
  state: string;
}

interface PostOffice {
  District: string;
  State: string;
}

interface PincodeApiResponse {
  Status: string;
  PostOffice: PostOffice[] | null;
}

export async function fetchPincodeDetails(pincode: string): Promise<PincodeDetails | null> {
  if (!/^\d{6}$/.test(pincode)) return null;

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    if (!res.ok) return null;

    const data: PincodeApiResponse[] = await res.json();
    const postOffice = data?.[0]?.PostOffice?.[0];
    if (data?.[0]?.Status !== "Success" || !postOffice) return null;

    return {
      city: postOffice.District,
      state: postOffice.State,
    };
  } catch {
    return null;
  }
}
