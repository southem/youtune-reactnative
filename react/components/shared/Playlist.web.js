import { Text } from "react-native";
import { useTheme } from '@react-navigation/native';
import { TouchableRipple } from 'react-native-paper';

import Navigation from '../../services/ui/Navigation';
import { showModal } from '../modals/MoreModal';
import { playlistStyle } from '../../styles/Playlist';

export default Playlist = ({ playlist, navigation, style, onPress }) => {
    let { title, subtitle, thumbnail, placeholder,
          videoId, browseId, playlistId } = playlist;

    let view = {
        title: title,
        subtitle: subtitle,
        thumbnail: thumbnail,
        videoId: videoId,
        browseId: browseId,
        playlistId: playlistId
    };

    const { colors } = useTheme();

    return (
        <TouchableRipple
            rippleColor={colors.primary}
            onLongPress={() => showModal(view)}
            onPress={
                onPress
                    ? () => onPress()
                    : () => {
                        Navigation.transitionPlaylist = {
                            playlistId: playlistId,
                            browseId: browseId,
                            title: title,
                            thumbnail: thumbnail
                        }
                        Navigation.handleMedia(view, navigation);
                    }
            }
            style={[style, playlistStyle.container]}
        >
            <>
            {
                placeholder
                    ? <Text style={[playlistStyle.cover, {color: colors.text, textAlign: "center", fontSize: 100}]}>{placeholder}</Text>
                    : <div style={playlistStyle.cover}>
                        <img src={thumbnail} loading="lazy" onLoad={e => e.target.style.opacity = 1} style={{width: "100%", height: "auto", opacity: 0, transition: "opacity .4s ease-in"}}></img>
                    </div>
            }
            

            <Text style={[playlistStyle.title, {color: colors.text}]} numberOfLines={2}>
                {title}
            </Text>

            <Text style={[playlistStyle.description, {color: colors.text}]} numberOfLines={2}>
                {subtitle}
            </Text>
            </>
        </TouchableRipple>
    );
}