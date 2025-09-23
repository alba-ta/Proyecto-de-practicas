                                                                           𝓕𝓐𝓢𝓔 𝟎

🅾🅱🅹🅴🆃🅸🆅🅾 ​ 🅳🅴 ​ 🅻🅰 ​ 🅵🅰🆂🅴 ​ 0⃣
La Fase 0: Obtención de la especificación de la API es un paso preparatorio crucial para el desarrollo del proyecto. Su objetivo principal es conseguir el "plano" o "mapa" técnico de la API de GLPI.

En lugar de construir el código manualmente, esta fase se centra en obtener la especificación OpenAPI de la API, un documento estructurado en formato JSON. Este archivo, conocido como doc.json, contiene la descripción formal de todos los endpoints, los parámetros y la estructura de los datos.

𝙍𝙚𝙨𝙪𝙢𝙚𝙣:

Cuando empecé, entré a Postman para crear una colección y avanzar con mi proyecto. Pensé que la URL de la documentación de la API era la que debía usar.

El problema es que, cuando vi el resultado en Postman, estaba todo en HTML. Me confundí mucho porque era una página web con texto y botones, no un archivo de datos. 

Fue entonces cuando me di cuenta de mi error. Yo confundí la documentación para humanos con el archivo de especificación para máquinas.

Mi error no fue usar Postman, sino que la URL que le di no era la correcta. Lo que saqué de la Fase 0 es que el primer y más importante paso es conseguir la herramienta correcta, el archivo doc.json, para que todo el proceso de generación de código funcione automáticamente.

𝘾𝙤𝙣𝙘𝙡𝙪𝙨𝙞𝙤́𝙣:
La Fase 0 ha sido completada con éxito al obtener el archivo doc.json. Este documento es la base para la siguiente fase, donde se utilizará para generar el código cliente de la API de forma automática, lo que facilitará el resto del proyecto.
