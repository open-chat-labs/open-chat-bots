export async function getSpotifyAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

  const url = "https://accounts.spotify.com/api/token";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error fetching Spotify token:", error);
  }
}

export async function searchSpotifyArtists(token: string, artist: string) {
  const url = "https://api.spotify.com/v1/search";
  const query = new URLSearchParams({
    q: artist,
    type: "artist",
  });

  try {
    const response = await fetch(`${url}?${query}`, {
      method: "get",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.artists.items[0];
  } catch (error) {
    console.error("Error running spotify search:", error);
  }
}

export async function searchSpotifyAlbums(token: string, album: string) {
  const url = "https://api.spotify.com/v1/search";
  const query = new URLSearchParams({
    q: album,
    type: "album",
  });

  try {
    const response = await fetch(`${url}?${query}`, {
      method: "get",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.albums.items[0];
  } catch (error) {
    console.error("Error running spotify search:", error);
  }
}

export async function searchSpotifySongs(token: string, song: string) {
  const url = "https://api.spotify.com/v1/search";
  const query = new URLSearchParams({
    q: song,
    type: "track",
  });

  try {
    const response = await fetch(`${url}?${query}`, {
      method: "get",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.tracks.items[0];
  } catch (error) {
    console.error("Error running spotify search:", error);
  }
}
