import { DeviceEventEmitter } from "react-native";
import Playlist from "../../models/music/playlist";
import API from "../api/API";
import IO from "./IO";
import Storage from "./storage/Storage";

export default class Downloads {
    static #downloadedTracks = [];
    static #cachedTracks = [];
    static #likedTracks = [];
    static #downloadQueue = [];
    static initialized = false;

    static #emitter = DeviceEventEmitter;
    static EVENT_INITIALIZE = "event-initialize";
    static EVENT_DOWNLOAD = "event-download";
    static EVENT_LIKE = "event-like";

    static addListener(event, listener) {
        return this.#emitter.addListener(event, listener);
    }

    static initialize() {
        return new Promise(async(resolve, reject) => {
            if (this.initialized)
                return resolve(true);
            
            this.#cachedTracks = await Storage.getAllKeys("Tracks");
            this.#likedTracks = await Storage.getAllKeys("Likes");
            this.#downloadedTracks = await Storage.getAllKeys("Downloads");

            this.initialized = true;
            this.#emitter.emit(this.EVENT_INITIALIZE, true);
            resolve(true);
        });
    }

    static waitForInitialization() {
        return new Promise((resolve, reject) => {
            if (this.initialized)
                return resolve();

            let eventListener = this.addListener(
                this.EVENT_INITIALIZE,
                () => {
                    resolve();
                    eventListener.remove();
                }
            );
        });
    }

    static deleteDownload(videoId) {
        return new Promise(async(resolve, reject) => {
            if (!this.initialized)
                await Downloads.waitForInitialization();

            try {
                await Storage.deleteItem("Downloads", videoId);
                let index = this.#downloadedTracks.indexOf(videoId);
                if (index != -1)
                    this.#downloadedTracks.splice(index, 1);

                if (this.isTrackLiked(videoId) == null) {
                    await Storage.deleteItem("Tracks", videoId);
                }
                
                this.#emitter.emit(this.EVENT_DOWNLOAD, true);
                resolve();

            } catch (e) {
                console.log(e);
            }
        });
    }

    static downloadTrack(videoId, cacheOnly) {
        return new Promise(async(resolve, reject) => {
            if (!this.initialized)
                await Downloads.waitForInitialization();

            if (videoId == undefined || videoId == null)
                return reject("no id");

            let i;
            if (!cacheOnly) {
                i = this.#downloadedTracks.findIndex(entry => videoId == entry);
                if (i > -1) return reject("already downloaded");

                i = this.#downloadQueue.findIndex(entry => videoId in entry);
                if (i > -1) return reject("still downloading");
            } else {
                i = this.#cachedTracks.indexOf(videoId);
                if (i > -1) return reject("already cached");
            }
            
            let controllerCallback = controller => {
                let index = this.#downloadQueue.findIndex(entry => videoId in entry);
                if (!cacheOnly) {
                    if (index > -1)
                        this.#downloadQueue[index][videoId] = controller;
                    else {
                        this.#downloadQueue.push({[videoId] : controller});
                        this.#emitter.emit(this.EVENT_DOWNLOAD, true);
                    }

                    controller.signal.onabort = () => {
                        reject("download aborted: " + videoId);
                    };
                }
            }
            
            try {
                let includedBefore = true;
                if (!this.#cachedTracks.includes(videoId)) {
                    includedBefore = false;
                    let track = await API.getAudioInfo({videoId: videoId, controllerCallback});
                    track.artwork = await API.getBlob({url: track.artwork, controllerCallback});
                    track.videoId = track.id;
                    delete track.id;
                    delete track.playable;
                    
                    await Storage.setItem("Tracks", track);
                    this.#cachedTracks.push(videoId);
                }

                if (!cacheOnly) {
                    let url = await API.getAudioStream({videoId: videoId, controllerCallback});
                    let blob = await API.getBlob({url: url, controllerCallback});

                    i = this.#downloadQueue.findIndex(entry => videoId in entry);
                    this.#downloadQueue.splice(i, 1);
                    if (["audio", "video"].includes(blob.type.split("/")[0])) {
                        await Storage.setItem("Downloads", {
                            videoId: videoId,
                            url: blob
                        });
                        
                        this.#downloadedTracks.push(videoId);
                    } else if (!includedBefore) {
                        await Storage.deleteItem("Tracks", videoId)
                        i = this.#cachedTracks.findIndex(entry => videoId in entry);
                        this.#cachedTracks.splice(i, 1);
                    }
                    
                    this.#emitter.emit(this.EVENT_DOWNLOAD, true);
                }
                
                resolve(videoId);
            } catch (e) {
                console.log(e);
            }
        });
    }

    static likeTrack(videoId, like) {
        return new Promise(async(resolve, reject) => {
            let prevState = await Storage.getItem("Likes", videoId);
            console.log({previousState: prevState});
            let deleting = false;
            if (prevState != null)
                deleting = prevState.like == like;

            console.log({deleting: deleting});

            if (deleting) {
                console.log({m: "deleting", id: videoId});
                await Storage.deleteItem("Likes", videoId);
            } else {
                let index = this.#likedTracks.indexOf(videoId);
                if (like) {
                    console.log({m: "liking", id: videoId});
                    await Downloads.downloadTrack(videoId, true);
                    if (index == -1)
                        this.#likedTracks.push(videoId);
                } else {
                    console.log({m: "disliking", id: videoId});

                    if (index == -1)
                        this.#likedTracks.splice(index, 1);
                }

                await Storage.setItem("Likes", {
                    videoId: videoId,
                    like: like
                });
            }

            if (deleting || !like) {
                if (!this.isTrackDownloaded(videoId) && this.isTrackCached(videoId))
                    await Storage.deleteItem("Tracks", videoId);
            }

            let index = this.#likedTracks.indexOf(videoId);
            if (!deleting && like && !this.isTrackCached(videoId)) {
                
                
                    
            } else if ((!like || deleting) && index > -1) {
                
            }

            this.#emitter.emit(this.EVENT_LIKE, deleting ? null : like);
            return resolve(videoId);
        });
    }

    static cancelDownload(videoId) {
        return new Promise(async(resolve, reject) => {
            if (!this.initialized)
                await Downloads.waitForInitialization();

            let index = this.#downloadQueue.findIndex(entry => videoId in entry);
            if (index > -1) {
                let abortController = this.#downloadQueue[index][videoId];
                abortController.abort();
                this.#downloadQueue.splice(index, 1);
                this.#emitter.emit(this.EVENT_DOWNLOAD, true);
                resolve(videoId);
            } else {
                reject(videoId);
            }
        });
    }

    static isTrackDownloaded(videoId) {
        if (!this.initialized || !videoId)
            return null;

        return this.#downloadedTracks.includes(videoId);
    }

    static isTrackCached(videoId) {
        if (!this.initialized || !videoId)
            return null;

        return this.#cachedTracks.includes(videoId);
    }

    static isTrackLikedSync(videoId) {
        if (!videoId || !this.#likedTracks.includes(videoId))
            return null;
        else if (this.#likedTracks.includes(videoId))
            return true;
    }

    static isTrackLiked(videoId) {
        return new Promise(async(resolve, reject) => {
            if (!this.initialized)
                await Downloads.waitForInitialization();
            
            let sync = Downloads.isTrackLikedSync(videoId);
            if (typeof sync != "undefined")
                resolve(sync);
            
            let object = await Storage.getItem("Likes", videoId);
            resolve(object?.like);
        });
    }

    static isTrackDownloading(videoId) {
        if (!this.initialized || !videoId)
            return null;
        
        let index = this.#downloadQueue.findIndex(entry => videoId in entry);  
        return index > -1;
    }

    static getDownloadingLength() {
        if (!this.initialized)
            return 0;
        
        return this.#downloadQueue.length;
    }

    static getTrack(videoId) {
        return new Promise(async(resolve, reject) => {
            if (!this.initialized)
                await Downloads.waitForInitialization();

            if (!this.#cachedTracks.includes(videoId))
                return resolve(null);
            
            let track = await Storage.getItem("Tracks", videoId);
            track.artwork = IO.getBlobAsURL(track.artwork);
            resolve(track);
        });
    }

    static getStream(videoId) {
        return new Promise(async(resolve, reject) => {
            if (!this.initialized)
                await Downloads.waitForInitialization();

            if (!this.#downloadedTracks.includes(videoId))
                return resolve(null);

            let object = await Storage.getItem("Downloads", videoId);
            let url = IO.getBlobAsURL(object.url);
            resolve(url);
        });
    }

    static getDownload(videoId) {
        return new Promise(async(resolve, reject) => {
            if (!this.initialized)
                await Downloads.waitForInitialization();

            if (!this.#downloadedTracks.includes(videoId))
                return resolve(null);
            
            let url = await Storage.getItem("Downloads", videoId);
            resolve(url);
        });
    }

    static loadLocalPlaylist(playlistId, videoId) {
        return new Promise(async(resolve, reject) => {
            if (!this.initialized)
                await Downloads.waitForInitialization();

            let localPlaylist = new Playlist();
            localPlaylist.playlistId = playlistId;
            localPlaylist.subtitle = "Playlist • Local";
            let list;
            
            if (playlistId == "LOCAL_DOWNLOADS") {
                list = this.#downloadedTracks;
                localPlaylist.title = "Downloads";
            } else if (playlistId == "LOCAL_LIKES") {
                list = this.#likedTracks;
                localPlaylist.title = "Liked Songs";
            } else {
                // list = await Downloads.getPlaylist(playlistId)
            }

            for (let i = 0; i < list.length; i++) {
                let id = list[i];
                let local = await this.getTrack(id);
                local.id = local.videoId;
                local.playlistId = playlistId;
                delete local.videoId;
                localPlaylist.list.push(local);

                if (id == videoId)
                    localPlaylist.index = i;
            }

            localPlaylist.secondSubtitle = localPlaylist.list.length
                + (localPlaylist.list.length != 1 ? " titles" : " title");
            resolve(localPlaylist);
        });
    }
}