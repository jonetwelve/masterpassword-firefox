/* Copyright Torbjorn Tyridal 2015

    This file is part of Masterpassword for Firefox (herby known as "the software").

    The software is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    The software is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with the software.  If not, see <http://www.gnu.org/licenses/>.
*/
/*jshint browser:true, jquery:true, devel:true, nonstandard:true, -W055 */

(function(){
function encode_utf8(s) {
  return unescape(encodeURIComponent(s));
}
function string_is_plain_ascii(s) {
    return s.length === encode_utf8(s).length;
}

 var stored_sites={},
     username="",
     key_id,
     alg_max_version,
     alg_min_version = 1;

function save_sites_to_backend() {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent("masterpassword-siteupdate", true, true, stored_sites);
    document.documentElement.dispatchEvent(event);
}

function passtype_to_str(type) {
    switch(type) {
        case 'x': return "Maximum";
        case 'l': return "Long";
        case 'm': return "Medium";
        case 'b': return "Basic";
        case 's': return "Short";
        case 'i': return "Pin";
        case 'n': return "Name";
        case 'p': return "Phrase";
        default: throw new Error("Unknown password type");
    }
}

function stored_sites_table_append(domain, site, type, loginname, count, ver) {
    type = passtype_to_str(type);
    $('#stored_sites > tbody').append('<tr><td>'+site+'<td><input class="domainvalue" type="text" data-old="'+
        domain+'" value="'+domain+'"><td>'+loginname+'<td>'+count+'<td>'+type+'<td>'+ver+
        '<td><img class="delete" src="delete.png">');
}

function stored_sites_table_update(stored_sites) {
    $('#stored_sites > tbody').empty();
    Object.keys(stored_sites).forEach(function(domain){
        Object.keys(stored_sites[domain]).forEach(function(site){
            let settings = stored_sites[domain][site],
                alg_version = alg_min_version;

            if (alg_min_version < 3 && !string_is_plain_ascii(site))
                alg_version = 2;
            if (settings.username === undefined)
                settings.username = "";
            stored_sites_table_append(domain,
                site,
                settings.type,
                settings.username,
                settings.generation,
                ""+alg_version);
        });
    });
}

window.addEventListener('masterpassword-configload', function(e){
    stored_sites = e.detail.sites;
    username = e.detail.username;
    key_id = e.detail.key_id;
    alg_max_version = e.detail.max_alg_version;

    if (!string_is_plain_ascii(username)) {
        alg_min_version = Math.min(3, alg_max_version);
        if (alg_min_version > 2)
            $('#ver3note').show();
    }

    stored_sites_table_update(stored_sites);
});

$(document).on('dragover dragenter', function(e){
    e.preventDefault();
    e.stopPropagation();
});

$('#stored_sites').on('change','.domainvalue',function(e){
    var $t = $(this), domain = $t.attr('data-old'), newdomain = $t.val(), site;
    $t.attr('data-old', newdomain);
    $t=this;
    do {
        $t = $t.parentNode;
    } while($t.nodeName !== 'TR');
    site=$($t).children('td:eq(0)').text();

    if (! (newdomain in stored_sites)) stored_sites[newdomain] = {};
    stored_sites[newdomain][site] = stored_sites[domain][site];
    delete stored_sites[domain][site];
    save_sites_to_backend();
});

$('#stored_sites').on('click','.delete',function(e){
    var $t, t = this;
    console.log(t);
    while (t.parentNode.nodeName !== 'TR') t = t.parentNode;
    if (t.parentNode.nodeName !== 'TR') throw new Error("logic error - cant find parent node");
    t=t.parentNode;
    $t=$(t);

    delete stored_sites[$t.find('td:eq(1) > input').val()][$t.children('td:eq(0)').text()];
    $(t).remove();
    save_sites_to_backend();
});


function get_sitesearch(sitename) {
    let y = sitename.split("@");
    if (y.length > 1)
        return y[y.length-1];
    else
        return sitename;
}

function resolveConflict(site) {
    return new Promise(function(resolve, reject){
        var div = document.createElement('div');
        div.style.cssText = "position:fixed;width:100%;height:100%;top:0;left:0;background:rgba(0,0,0,0.7);z-index:500";
        div.innerHTML = [
            '<div style="border:2px black inset;position:fixed;top:5em;left:5em;width:50%;background:white;padding: 1em"><h2>Conflicting ',
            site.sitename,
            ' (<small>',site.sitesearch,'</small>)',
            '</h2><h3>existing</h3>',
            'type: ', passtype_to_str(stored_sites[site.sitesearch][site.sitename].type),
            ' count: ', stored_sites[site.sitesearch][site.sitename].generation,
            ' username: ', stored_sites[site.sitesearch][site.sitename].username,
            '<h3>importing</h3>',
            'type: ', passtype_to_str(site.passtype),
            ' count: ', site.passcnt,
            ' username: ', site.loginname,
            '<div style="padding-top:1em"><button id="existing">Keep existing</button> <button id="imported">Replace with imported</button></div>',
            '</div>'].join('');
        div.addEventListener('click', function(ev){
            switch (ev.target.id) {
                case 'existing':
                    resolve(stored_sites[site.sitesearch][site.sitename]);
                    break;
                case 'imported':
                    resolve({'generation': site.passcnt, 'type': site.passtype, 'username': site.loginname});
                    break;
                default:
                    return;

            }
            div.parentNode.removeChild(div);
        });
        document.querySelector('body').appendChild(div);
    });
}

$(document).on('drop', function(e){
    e.originalEvent.dataTransfer.dropEffect='move';
    e.preventDefault();
    e.stopPropagation();
    if (e.originalEvent.dataTransfer.files.length !== 1) return;
    if (! /.*\.mpsites$/gi.test(e.originalEvent.dataTransfer.files[0].name)) {
        alert("need a .mpsites file");
        return;
    }
    var fr = new FileReader();
    fr.onload=function(x){
        var has_ver1_mb_sites = false;
        try {
            x = window.mpw_utils.read_mpsites(x.target.result, username, key_id, confirm);
            if (!x) return;
        } catch (e) {
            if (e.name === 'mpsites_import_error') {
                alert(e.message);
                return;
            }
            else throw e;
        }

        var done = new Promise(function(all_done){
            function popsite() {
                if (! x.length) return false;

                var p, site = x.shift();

                site.sitesearch = get_sitesearch(site.sitename);
                if (site.passalgo < 2 && !string_is_plain_ascii(site.sitename))
                    has_ver1_mb_sites = true;

                if (! (site.sitesearch in stored_sites)) stored_sites[site.sitesearch] = {};
                if (site.sitename in stored_sites[site.sitesearch] &&
                    (stored_sites[site.sitesearch][site.sitename].generation !== site.passcnt ||
                        stored_sites[site.sitesearch][site.sitename].type !== site.passtype ||
                        stored_sites[site.sitesearch][site.sitename].username !== site.loginname)) {

                    p = resolveConflict(site);
                } else {
                    p = Promise.resolve({'generation': site.passcnt, 'type': site.passtype, 'username': site.loginname}, undefined);
                }

                p.then(function(cfg, nextanswer){
                    stored_sites[site.sitesearch][site.sitename] = cfg;
                    if (!popsite())
                        all_done();
                })
                .catch(function(reason){
                    console.error("popsite failed", reason);
                });

                return true;
            }

            if (!popsite())
                all_done();
        });


        done.then(function(){
            stored_sites_table_update(stored_sites);

            if (has_ver1_mb_sites)
                alert("Version mismatch\n\nYour file contains site names with non ascii characters from "+
                      "an old masterpassword version. This addon can not reproduce these passwords");
            else
                console.debug('Import successful');

            save_sites_to_backend();
        })
        .catch(function(err){
            console.error(err);
        });

    };
    fr.readAsText(e.originalEvent.dataTransfer.files[0]);

});

$('body').on('click','.export_mpsites',function(){
    start_data_download(window.mpw_utils.make_mpsites(key_id, username, stored_sites, alg_min_version, alg_max_version), 'firefox.mpsites');
});

function start_data_download(stringarr,filename) {
    var a = window.document.createElement('a');
    a.href = window.URL.createObjectURL(new Blob(stringarr, {type: 'text/plain'}));
    a.download = filename;

    // Append anchor to body.
    document.body.appendChild(a);
    a.click();

    // Remove anchor from body
    document.body.removeChild(a);
}

}());
